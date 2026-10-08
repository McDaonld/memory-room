// Pure reading-layout math: no DOM, Three objects, camera writes,
// textures, model scale changes or production state mutations.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const finite=(n,name)=>{if(!Number.isFinite(n))throw new TypeError(`${name} must be finite`);return n;};
function count(n){if(!Number.isInteger(n)||n<1)throw new RangeError('totalPages must be a positive integer');return n;}
function index(n,total){count(total);if(!Number.isInteger(n)||n<0||n>=total)throw new RangeError('page index outside the edition');return n;}
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
function rotate(v,q){
 const [x,y,z,w]=q,[vx,vy,vz]=v;
 const tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);
 return [vx+w*tx+y*tz-z*ty,vy+w*ty+z*tx-x*tz,vz+w*tz+x*ty-y*tx];
}
function quaternion(q){
 if(!Array.isArray(q)||q.length!==4||q.some(v=>!Number.isFinite(v)))throw new TypeError('camera quaternion must have four finite values');
 const length=Math.hypot(...q);if(length<1e-9)throw new RangeError('zero camera quaternion');
 return q.map(v=>v/length);
}

// Canonical pageIndex means the number of fully turned leaves. It is NOT
// the visible recto page index. The inside-cover contents is not body page -1.
export function pageAddress(page,totalPages){
 index(page,totalPages);
 return {page,folio:page+1,leafIndex:Math.floor(page/2),spreadIndex:Math.floor((page+1)/2),side:page%2?'left':'right'};
}

export function pagesInSpread(spreadIndex,totalPages){
 count(totalPages);
 if(!Number.isInteger(spreadIndex)||spreadIndex<0||spreadIndex>Math.ceil(totalPages/2))throw new RangeError('spread outside the edition');
 return [spreadIndex*2-1,spreadIndex*2].filter(p=>p>=0&&p<totalPages);
}

export function focusFromSpread(spreadIndex,totalPages,rememberedPage=null){
 const visible=pagesInSpread(spreadIndex,totalPages);
 // An odd-length edition may have been turned to the canonical blank final
// spread in spread mode. Enter single mode by returning to its final real page.
 return visible.includes(rememberedPage)?rememberedPage:(visible[0]??totalPages-1);
}

export function planPageFocus(fromPage,toPage,totalPages){
 const from=pageAddress(fromPage,totalPages),to=pageAddress(toPage,totalPages),turns=[];
 let spread=from.spreadIndex;
 while(spread!==to.spreadIndex){
  const direction=Math.sign(to.spreadIndex-spread),leafIndex=direction>0?spread:spread-1;
  spread+=direction;
  turns.push({leafIndex,fromT:direction>0?0:1,toT:direction>0?1:0,direction,spreadAfter:spread});
 }
 return {from,to,kind:fromPage===toPage?'none':turns.length?'turn':'pan',turns,
  phases:fromPage===toPage?[]:turns.length?['fit-spread','turn-leaf','focus-page']:['focus-page'],
  previousEnabled:toPage>0,nextEnabled:toPage<totalPages-1};
}

export function stepPageFocus(fromPage,direction,totalPages){
 index(fromPage,totalPages);if(direction!==1&&direction!==-1)throw new RangeError('direction must be 1 or -1');
 return planPageFocus(fromPage,clamp(fromPage+direction,0,totalPages-1),totalPages);
}

// All coordinates are book-root-local, with actual createLeaves dimensions
// and that leaf's actual baseZ/turnedZ (including layerStep). At t=0/1 the
// canonical bendPage plane is exactly flat to Float32 rounding.
export function flatPageBounds(address,{width,height,baseZ,turnedZ,bindingInsetX=0,centerY=0}){
 if(!(width>0&&height>0))throw new RangeError('positive physical page dimensions required');
 const left=address.side==='left',z=finite(left?turnedZ:baseZ,'leaf Z');
 return {min:[left?-bindingInsetX-width:bindingInsetX,centerY-height/2,z],max:[left?-bindingInsetX:bindingInsetX+width,centerY+height/2,z]};
}

function rectangle(viewport,marginPx){
 const {width,height,insets={}}=viewport;
 if(!(width>0&&height>0))throw new RangeError('positive CSS viewport dimensions required');
 const rect={left:(insets.left||0)+marginPx,right:width-(insets.right||0)-marginPx,
  top:(insets.top||0)+marginPx,bottom:height-(insets.bottom||0)-marginPx};
 if(rect.right<=rect.left||rect.bottom<=rect.top)throw new RangeError('UI insets leave no reading region');
 return {...rect,width:rect.right-rect.left,height:rect.bottom-rect.top,center:[(rect.left+rect.right)/2,(rect.top+rect.bottom)/2]};
}

// Returned position/quaternion are WORLD values. Integration must convert to
// the object's parent space; do not assign world values under a rotated parent.
// Read camera.getEffectiveFOV() when camera.zoom is not 1.
export function fitPageFocus({bounds,camera,viewport,zoom=1,panPixels=[0,0],marginPx=14,frontMostLocalZ=null}){
 const q=quaternion(camera.quaternion),fov=finite(camera.fov,'fov'),aspect=camera.aspect??viewport.width/viewport.height;
 if(!(fov>0&&fov<179&&aspect>0&&zoom>0))throw new RangeError('invalid perspective or zoom');
 if(!bounds||bounds.min?.length!==3||bounds.max?.length!==3||bounds.min.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(bounds.max[i])||v>bounds.max[i]))throw new RangeError('invalid page bounds');
 const center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),size=sub(bounds.max,bounds.min);
 if(!(size[0]>0&&size[1]>0))throw new RangeError('page must have positive width and height');
 const rect=rectangle(viewport,Math.max(0,marginPx)),tan=Math.tan(fov*Math.PI/360),near=camera.near??.03;
 const rectNdc={left:rect.left*2/viewport.width-1,right:rect.right*2/viewport.width-1,
  top:1-rect.top*2/viewport.height,bottom:1-rect.bottom*2/viewport.height};
 // The extra term also fits a swept 3D page envelope in an off-centre safe
 // rectangle (e.g. a taller bottom toolbar), where simply adding half-Z fails.
 const fitDepth=Math.max(
  (size[0]/(2*tan*aspect)+Math.max(Math.abs(rectNdc.left),Math.abs(rectNdc.right))*size[2]/2)/(rect.width/viewport.width),
  (size[1]/(2*tan)+Math.max(Math.abs(rectNdc.top),Math.abs(rectNdc.bottom))*size[2]/2)/(rect.height/viewport.height));
 const frontOffset=Math.max(size[2]/2,(frontMostLocalZ??bounds.max[2])-center[2]);
 const minDepth=near+Math.max(0,frontOffset)+.002;
 // Whole-page fit is the farthest permitted stage. Normalize any older
 // sub-fit zoom without moving the camera or relaxing near-clip clearance.
 const depth=Math.max(minDepth,fitDepth/clamp(zoom,1,16)),effectiveZoom=fitDepth/depth;
 const nearestDepth=depth-size[2]/2;
 const projectedSize=[size[0]/(2*nearestDepth*tan*aspect)*viewport.width,size[1]/(2*nearestDepth*tan)*viewport.height];
 // A small page stays centred. After magnification the allowed pan exposes
// either edge at the reading-region edge, without losing the whole page.
 const panLimits=[Math.max(0,(projectedSize[0]-rect.width)/2),Math.max(0,(projectedSize[1]-rect.height)/2)];
 const pan=panPixels.map((v,i)=>clamp(finite(v,'pan'),-panLimits[i],panLimits[i]));
 const screenCenter=[rect.center[0]+pan[0],rect.center[1]+pan[1]];
 const ndc=[screenCenter[0]*2/viewport.width-1,1-screenCenter[1]*2/viewport.height];
 const worldCenter=add(camera.position,rotate([ndc[0]*depth*tan*aspect,ndc[1]*depth*tan,-depth],q));
 return {position:sub(worldCenter,rotate(center,q)),quaternion:q,scale:[1,1,1],
  anchorLocal:center,anchorWorld:worldCenter,screenCenter,depth,fitDepth,minDepth,effectiveZoom,
  panPixels:pan,panLimits,projectedSize,readingRect:rect};
}

// Convenience state updates: never mutate the current state or camera.
// Use returned clamped panPixels after each fit, not a hidden unbounded total.
export function panPageFocus(options,deltaX,deltaY){
 return fitPageFocus({...options,panPixels:[(options.panPixels?.[0]||0)+deltaX,(options.panPixels?.[1]||0)+deltaY]});
}
export function zoomPageFocus(options,wheelDelta){
 return fitPageFocus({...options,zoom:(options.zoom||1)*Math.exp(-clamp(wheelDelta,-400,400)*.0013)});
}

// A fixed-camera physical turn needs the swept sheet's near-clip clearance
// as well as both pages. No virtual duplicate sheet or camera move is needed.
// The canonical angle-field bend preserves each row's arc length, so +width
// is a conservative front bound for any t in [0,1].
export function openSpreadTurnBounds({width,height,baseZ,turnedZ,coverZ=0,bindingInsetX=0,centerY=0}){
 const totalArc=bindingInsetX+width;
 return {min:[-totalArc,centerY-height/2-.01,Math.min(baseZ,turnedZ,-Math.abs(coverZ))],
  max:[totalArc,centerY+height/2+.01,Math.max(baseZ,turnedZ,Math.abs(coverZ))+totalArc+.01]};
}
