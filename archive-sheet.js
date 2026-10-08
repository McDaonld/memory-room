import * as THREE from './vendor/three.module.js';
import {captureInspectionPose,turnInspectionObject} from './inspection-turntable.js?v=20261007-overnight1';

// A document leaves its sleeve in the same 3D space. Neither extraction,
// rotation nor magnification changes the room camera or the open folder.
export function createArchiveSheet({scene,camera,onChange=()=>{},onState=()=>{},reduced=false,movementGuard=null}){
 let current=null,tween=null;
 const ease=t=>t*t*(3-2*t);
 const pose=o=>({position:o.position.clone(),quaternion:o.quaternion.clone()});
 function move(to,seconds,done){const from=pose(current.object);tween={from,to,time:0,d:reduced?Math.min(.08,seconds):seconds,done};}
 function sequence(points,done,seconds=.48){let i=0;const next=()=>i<points.length?move(points[i++],seconds,next):done?.();next();}
 function change(){onChange();}
 function state(){onState(current?.phase||'idle',current?.title||'');change();}
 function displayTexture(image){const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;texture.needsUpdate=true;return texture;}
 function open({source,page,width,height}){
  if(current||!source||!page?.image)return false;
  source.updateWorldMatrix(true,false);
  const bounds=new THREE.Box3().setFromObject(source),position=bounds.getCenter(new THREE.Vector3());
  const forward=camera.getWorldDirection(new THREE.Vector3()),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  position.addScaledVector(forward,-.006);
  const ratio=page.image.width/page.image.height,w=Math.min(width*.91,height*.93*ratio),h=w/ratio;
  const root=new THREE.Group();root.name='ExtractedArchiveDocument';scene.add(root);
  // Scan pixels and typeset canvases have different native dimensions. Give
  // each mode its own immutable GPU allocation and reuse it on later toggles.
  const textMode=Boolean(page.textImage),texture=displayTexture(textMode?page.textImage:page.image),textures=new Map([[textMode,texture]]);
  const paper=new THREE.Mesh(new THREE.BoxGeometry(w,h,.00065),new THREE.MeshStandardMaterial({color:'#f3f0e8',roughness:.87}));root.add(paper);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(w-.0008,h-.0008),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));face.position.z=.00036;root.add(face);
  root.position.copy(position);root.quaternion.copy(camera.quaternion);
  const start=pose(root),above={position:position.clone().addScaledVector(up,height*1.06),quaternion:root.quaternion.clone()};
  const fit=Math.max(h*1.32,w/camera.aspect*1.18)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  const end={position:camera.position.clone().addScaledVector(forward,Math.max(.28,fit)),quaternion:camera.quaternion.clone()};
  if(movementGuard){
    const first=movementGuard.move(root,above.position);root.position.copy(above.position);root.updateWorldMatrix(true,true);
    const second=first&&movementGuard.move(root,end.position);root.position.copy(start.position);root.updateWorldMatrix(true,true);
    if(!first||!second){root.removeFromParent();root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});for(const texture of textures.values())texture.dispose();return false;}
  }
  current={object:root,source,title:page.heading,start,above,end,page,face,texture,textures,textMode,interaction:'read',history:[],phase:'extracting',sourceVisible:source.visible};source.visible=false;
  state();sequence([above,end],()=>{current.phase='open';current.history=[pose(root)];current.turnPose=captureInspectionPose(root);if(current.closeRequested)close();else state();});return true;
 }
 function close(){
  if(current?.phase==='extracting'||current?.phase==='adjusting'){current.closeRequested=true;return true;}
  if(!current||current.phase!=='open')return false;
  current.phase='returning';state();
  // Reverse only accepted reading/rotation poses before the original sleeve route.
  const history=[...current.history].reverse();
  const restoreSource=()=>{
   const old=current;old.source.visible=old.sourceVisible;old.object.removeFromParent();
   old.object.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
   for(const texture of old.textures.values())texture.dispose();
   current=null;tween=null;state();
  };
  sequence(history,()=>sequence([current.above,current.start],restoreSource),Math.min(.24,1.2/Math.max(1,history.length)));return true;
 }
 function rotate(yaw,pitch){if(current?.phase!=='open'||current.interaction!=='rotate'||tween||current.history.length>=1024)return false;const shape=movementGuard?.shape(current.object);if(!shape||!movementGuard.sphere(current.object,shape.center,shape.radius))return false;turnInspectionObject(current.object,current.turnPose,yaw,pitch);record('rotate');change();return true;}
 function record(kind){
  const point={...pose(current.object),kind,center:movementGuard.shape(current.object).center},history=current.history,last=history.at(-1),previous=history.at(-2);
  if(previous&&kind==='move'&&last.kind==='move'&&previous.quaternion.angleTo(point.quaternion)<1e-8&&movementGuard.move(current.object,previous.position))history.pop();
  else if(previous&&kind==='rotate'&&last.kind==='rotate'&&last.center?.distanceTo(point.center)<1e-7)history.pop();
  history.push(point);
 }
 function place(position){if(current.history.length>=1024||!movementGuard?.move(current.object,position))return false;current.object.position.copy(position);current.object.updateWorldMatrix(true,true);record('move');change();return true;}
 function viewVertices(){const inverse=camera.matrixWorldInverse,points=[];current.object.updateWorldMatrix(true,true);current.object.traverse(mesh=>{if(!mesh.isMesh)return;for(let i=0;i<mesh.geometry.attributes.position.count;i++){const v=new THREE.Vector3();mesh.getVertexPosition(i,v);points.push(v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));}});return points;}
 function pan(dx,dy,{width,height,insets={}}){
  if(current?.phase!=='open'||current.interaction!=='read'||tween||!Number.isFinite(dx+dy)||width<=0||height<=0)return false;
  camera.updateWorldMatrix(true,false);const points=viewVertices(),center=current.object.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse),depth=-center.z,tan=Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()/2));
  const box=new THREE.Box3().setFromPoints(points),units=2*depth*tan/height,rect={left:12+(insets.left||0),right:width-12-(insets.right||0),top:12+(insets.top||0),bottom:height-12-(insets.bottom||0)};
  if(rect.right<=rect.left||rect.bottom<=rect.top)return false;
  const projected=points.map(p=>({x:width/2+p.x/(-p.z*tan*camera.aspect)*width/2,y:height/2-p.y/(-p.z*tan)*height/2})),xs=projected.map(p=>p.x),ys=projected.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const clamp=(delta,min,max,lo,hi)=>max-min>hi-lo?THREE.MathUtils.clamp(delta,hi-max,lo-min):((lo+hi)-(min+max))/2;
  const x=clamp(dx,minX,maxX,rect.left,rect.right),y=clamp(dy,minY,maxY,rect.top,rect.bottom),shift=new THREE.Vector3(x*units,-y*units,0).applyQuaternion(camera.quaternion),position=current.object.position.clone().add(shift);
  return place(position);
 }
 function zoom(delta){
  if(current?.phase!=='open'||tween||!Number.isFinite(delta))return false;
  camera.updateWorldMatrix(true,false);const forward=camera.getWorldDirection(new THREE.Vector3()),center=current.object.getWorldPosition(new THREE.Vector3()),depth=center.clone().sub(camera.position).dot(forward),endDepth=current.end.position.clone().sub(camera.position).dot(forward),points=viewVertices(),front=Math.max(...points.map(v=>v.z))+depth;
  const minimum=Math.max(.12,front+camera.near+.012),wanted=THREE.MathUtils.clamp(depth*Math.exp(THREE.MathUtils.clamp(delta,-400,400)*.0013),minimum,endDepth);
  const position=current.object.position.clone().addScaledVector(forward,wanted-depth);if(current.interaction==='rotate'){const shape=movementGuard.shape(current.object,position);if(!movementGuard.sphere(current.object,shape.center,shape.radius))return false;}return place(position);
 }
 function setInteraction(value){
  if(current?.phase!=='open'||tween||!['read','rotate'].includes(value)||!movementGuard||current.history.length>=1024)return false;if(current.interaction===value)return true;
  if(value==='read'){current.interaction=value;state();return true;}
  const shape=movementGuard.shape(current.object),forward=camera.getWorldDirection(new THREE.Vector3()),depth=shape.center.clone().sub(camera.position).dot(forward),min=shape.radius+camera.near+.008,max=current.end.position.clone().sub(camera.position).dot(forward);
  let target=null;for(let i=0;i<=24;i++){const d=THREE.MathUtils.lerp(Math.max(min,Math.min(max,depth)),min,i/24),center=camera.position.clone().addScaledVector(forward,d),position=current.object.position.clone().add(center.clone().sub(shape.center));if(movementGuard.sphere(current.object,center,shape.radius)&&movementGuard.move(current.object,position)){target=position;break;}}
  if(!target)return false;current.phase='adjusting';state();move({position:target,quaternion:current.object.quaternion.clone()},.24,()=>{record('move');current.interaction=value;current.phase='open';if(current.closeRequested)close();else state();});return true;
 }

 function setTextMode(value){
  if(current?.phase!=='open'||!current.page.textImage)return false;
  const textMode=Boolean(value);if(current.textMode===textMode)return true;
  let texture=current.textures.get(textMode);
  if(!texture){texture=displayTexture(textMode?current.page.textImage:current.page.image);current.textures.set(textMode,texture);}
  current.textMode=textMode;current.texture=texture;current.face.material.map=texture;state();return true;
 }
 function update(dt){let remaining=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1));while(tween&&current&&remaining>1e-9){const a=tween,step=Math.min(remaining,Math.max(0,a.d-a.time));a.time+=step;remaining-=step;const t=Math.min(1,a.time/a.d),k=ease(t);current.object.position.lerpVectors(a.from.position,a.to.position,k);current.object.quaternion.slerpQuaternions(a.from.quaternion,a.to.quaternion,k);change();if(t===1){tween=null;a.done?.();}else break;}}
 return {open,close,rotate,pan,zoom,setInteraction,update,setTextMode,get interaction(){return current?.interaction||'read';},get hasText(){return Boolean(current?.page.textImage);},get textMode(){return Boolean(current?.textMode);},get active(){return Boolean(current);},get busy(){return Boolean(tween);},get object(){return current?.object||null;},get phase(){return current?.phase||'idle';}};
}
