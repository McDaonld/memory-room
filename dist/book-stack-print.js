// Runtime material/UV repair. Keeps every vertex, transform, hinge,
// collider, root name and paper block unchanged. No photo is edited or sampled.
const active=new WeakMap();
const FONT='"Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif';
function colourHex(rgb){return '#'+rgb.map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');}
function localPoints(THREE,mesh,root){root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),p=mesh.geometry.attributes.position,out=[];for(let i=0;i<p.count;i++)out.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));return out;}
function spineUV(THREE,mesh,root){
 const points=localPoints(THREE,mesh,root),box=new THREE.Box3().setFromPoints(points),row=points.filter(v=>Math.abs(v.y-box.min.y)<1e-5).sort((a,b)=>a.z-b.z),arc=[];
 let distance=0;for(let i=0;i<row.length;i++){if(i)distance+=row[i].distanceTo(row[i-1]);arc.push({z:row[i].z,d:distance});}
 if(!(distance>0&&box.max.y>box.min.y))throw Error('Invalid continuous spine '+mesh.name);
 const along=z=>{const j=arc.findIndex(v=>v.z>=z-1e-8);if(j<=0)return j===0?0:distance;const a=arc[j-1],b=arc[j];return a.d+(b.d-a.d)*(z-a.z)/(b.z-a.z);};
 const geometry=mesh.geometry.clone(),uv=new Float32Array(points.length*2);
 points.forEach((v,i)=>{uv[i*2]=(box.max.y-v.y)/(box.max.y-box.min.y);uv[i*2+1]=1-along(v.z)/distance;});
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
 return {geometry,width:box.max.y-box.min.y,height:distance,projectedHeight:box.max.z-box.min.z};
}
function drawSpine(width,height,style,verifiedText){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d',{alpha:false});
 c.fillStyle=style.base;c.fillRect(0,0,width,height);
 // Continuous paper and ink fields provide a neutral stack of example books.
 if(style.field){c.fillStyle=style.field;c.fillRect(width*style.start,0,width*(style.end-style.start),height);}
 if(style.rule){c.fillStyle=style.rule;c.fillRect(0,Math.round(height*.10),width,Math.max(1,height*.025));c.fillRect(0,Math.round(height*.88),width,Math.max(1,height*.02));}
 if(verifiedText){
  let size=height*.66;c.textBaseline='middle';c.textAlign='center';c.fillStyle=style.ink||'#26332d';
  c.font=`600 ${size}px ${FONT}`;while(size>8&&c.measureText(verifiedText).width>width*.88)c.font=`600 ${size*=.95}px ${FONT}`;
  c.fillText(verifiedText,width*.5,height*.5);
 }
 return canvas;
}
export function patchCabinetTopBookPrint(THREE,asset,specs,{identities={},anisotropy=8}={}){
 active.get(asset)?.dispose();const owned=[],maps=[],records=[];
 for(const spec of specs.filter(s=>/^FlatBook\d{2}$/.test(s.root))){
  const root=asset.getObjectByName(spec.root);if(!root)continue;
  let spine;root.traverse(m=>{if(m.isMesh&&/ContinuousCurvedSpine$/.test(m.name))spine=m;});if(!spine)continue;
  const original=spine.material,linear=original.color.toArray(),base=colourHex(linear);
  // Correct the authored palette interpreted as display RGB rather than
  // linear Blender inputs. Never apply this conversion to global materials.
  const dark=Math.max(...linear)<.60,navy=linear[2]>linear[0]*1.2&&linear[2]>linear[1]*1.2&&Math.max(...linear)<.50;
  const style={base,ink:dark?'#eee9d7':'#26342d'};
  // The reference's dark-blue group has a long cream print field; the green,
  // cyan, ochre and plain-stock books retain continuous full colour instead
  // of receiving the same generic white label panel.
  if(navy){style.field='#ddd7bf';style.start=.18;style.end=.78;style.ink='#24332d';}
  // No arbitrary 8-bin strips, faux letters, random dot noise or "unknown"
  // UI labels. Unconfirmed identities print no title/publisher/year.
  const identity=identities[spec.root],verifiedText=['confirmed','example'].includes(identity?.status)?(identity.print?.visibleText||[]).join('　'):'';
  const uv=spineUV(THREE,spine,root),width=2048,height=Math.max(8,Math.round(width*uv.height/uv.width));
  const image=drawSpine(width,height,style,verifiedText),map=new THREE.CanvasTexture(image);map.colorSpace=THREE.SRGBColorSpace;map.flipY=false;map.anisotropy=Math.max(1,Math.min(16,anisotropy));map.name='Public example stack spine '+spec.root;
  map.userData.printLayout={physicalWidth:uv.width,physicalHeight:uv.height,projectedHeight:uv.projectedHeight,width,height,verifiedText,identityStatus:identity?.status||'unknown',appearanceApproximation:true};
  maps.push(map);
  root.traverse(mesh=>{
   if(!mesh.isMesh||!(mesh===spine||/(FrontCover|BackCover)$/.test(mesh.name)))return;
   const previousMaterial=mesh.material,previousGeometry=mesh.geometry,material=previousMaterial.clone();
   if(mesh===spine){material.color.set('#ffffff');material.map=map;mesh.geometry=uv.geometry;}
   else material.color.set(base); // Three converts this sRGB colour to linear.
   material.name='Public example stack '+(mesh===spine?'spine':'cover')+' | '+spec.root;material.needsUpdate=true;mesh.material=material;
   owned.push({mesh,previousMaterial,previousGeometry,material,geometry:mesh===spine?uv.geometry:null});
  });
  records.push({root:spec.root,sourceDisplayedHex:'#'+original.color.getHexString(),repairedDisplayHex:base,style,canvas:[width,height],verifiedText,physicalPrint:[uv.width,uv.height],originalGeometryPreserved:true});
 }
 let disposed=false;const result={records,dispose(){if(disposed)return;disposed=true;for(const r of owned){r.mesh.material=r.previousMaterial;r.mesh.geometry=r.previousGeometry;r.material.dispose();r.geometry?.dispose();}maps.forEach(m=>m.dispose());active.delete(asset);}};active.set(asset,result);return result;
}
