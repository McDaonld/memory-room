import * as THREE from './vendor/three.module.js';
import {captureInspectionPose,turnInspectionObject} from './inspection-turntable.js?v=20261007-overnight1';
import {constrainCameraPosition} from './view-navigation.js?v=20261007-overnight1';

// The room owns navigation. close(done,{restoreView:false}) performs only the
// physical return, so a direct switch never depends on an old camera callback.
export function createCabinetInteractions({scene,asset,camera,mark,flyCamera,onBusy=()=>{},onChange=()=>{},caption=()=>{}}){
 const entries=new Map(),DOOR='detail:CabinetDoorHinge',GAP=.055;
 let door=null,doorOpen=false,doorTarget=false,doorActive=false,doorView=null;
 let current=null,tween=null,generation=0,busy=false,pending=null,cameraPending=false;
 const ease=t=>t*t*(3-2*t),V=a=>new THREE.Vector3(...a);
 const pose=o=>({position:o.position.clone(),quaternion:o.quaternion.clone()});
 const copyPose=p=>({position:p.position.clone(),quaternion:p.quaternion.clone()});
 function setBusy(value){if(busy!==value){busy=value;onBusy(value);}onChange();}
 function changed(){asset.updateMatrixWorld(true);updateHitProxy();onChange();}
 function captureView(){const v=flyCamera.getState?.();return v?{position:v.position.clone(),look:v.look.clone()}:null;}
 function animate(seconds,frame,done){tween={time:0,duration:Math.max(.06,seconds),frame,done};setBusy(true);frame(0);changed();}
 function cameraTo(position,look,seconds,done,id=generation){cameraPending=true;flyCamera(position,look,seconds,()=>{if(id!==generation)return;cameraPending=false;done?.();});}
 function moveTo(context,to,seconds,done){const from=pose(context.entry.object);animate(seconds,t=>{context.entry.object.position.lerpVectors(from.position,to.position,t);context.entry.object.quaternion.slerpQuaternions(from.quaternion,to.quaternion,t);},done);}
 function playRoute(context,route,done,{remember=false}={}){let i=0;const next=()=>{if(current!==context)return;if(i===route.length){done?.();return;}const target=route[i++];moveTo(context,target,.56,()=>{if(remember)context.visited.push(copyPose(target));next();});};next();}
 function worldPose(entry,position,worldQuaternion){entry.object.parent?.updateWorldMatrix(true,false);return {position:entry.object.parent?entry.object.parent.worldToLocal(position.clone()):position.clone(),quaternion:worldQuaternion?(entry.object.parent?entry.object.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldQuaternion):worldQuaternion.clone()):entry.rest.quaternion.clone()};}
 function localBox(entry,state='closed'){
  const b=entry.spec.geometryBounds?.[state]?.local||entry.measured?.[state]||entry.spec.localBounds;
  return b?new THREE.Box3(V(b.min),V(b.max)):new THREE.Box3(new THREE.Vector3(-.05,-.05,-.05),new THREE.Vector3(.05,.05,.05));
 }
 function worldBox(entry,state='closed'){entry.object.updateWorldMatrix(true,false);return localBox(entry,state).applyMatrix4(entry.object.matrixWorld);}
 function setHinge(entry,t){if(entry.hinge)entry.hinge.quaternion.copy(entry.hingeRest).multiply(new THREE.Quaternion().setFromAxisAngle(V(entry.spec.axis),entry.spec.open*t));}
 function setFan(entry,t){
  for(const r of entry.spec.ribs||[]){const o=entry.object.getObjectByName(r.node);if(o)o.rotation.z=THREE.MathUtils.lerp(r.closed,r.open,t);}
  for(const p of entry.spec.paperMorphs||[]){const o=entry.object.getObjectByName(p.node),i=o?.morphTargetDictionary?.[p.target];if(i!==undefined)o.morphTargetInfluences[i]=t;}
 }
 function setOpen(context,t){context.openFraction=t;setHinge(context.entry,t);setFan(context.entry,t);}
 function geometryBox(entry){
  entry.object.updateWorldMatrix(true,true);const inverse=entry.object.matrixWorld.clone().invert(),box=new THREE.Box3(),p=new THREE.Vector3();
  entry.object.traverse(o=>{if(!o.isMesh||o.userData.cabinetHitProxy)return;const count=o.geometry.attributes.position?.count||0;for(let i=0;i<count;i++){o.getVertexPosition(i,p);p.applyMatrix4(o.matrixWorld).applyMatrix4(inverse);box.expandByPoint(p);}});
  return box;
 }
 function measureBounds(entry){
  if(entry.spec.geometryBounds&&!entry.object.userData.refreshInspectionBounds)return;
  // A physically attached replacement charm changes the backpack silhouette.
  // Measure its actual meshes, including every opened-flap pose, once at load.
  if(entry.object.userData.refreshInspectionBounds)delete entry.spec.geometryBounds;
  const closed=geometryBox(entry),swept=closed.clone();let opened=closed.clone();
  if(entry.spec.type==='folding_fan'||entry.hinge){for(let i=1;i<=20;i++){setHinge(entry,i/20);setFan(entry,i/20);opened=geometryBox(entry);swept.union(opened);}setHinge(entry,0);setFan(entry,0);}
  const plain=b=>({min:b.min.toArray(),max:b.max.toArray()});entry.measured={closed:plain(closed),open:plain(opened),swept:plain(swept)};
 }
 function updateHitProxy(){
  for(const entry of entries.values())if(entry.proxy){
   const selected=current?.entry===entry,fraction=selected?current.openFraction:0;
   const closed=localBox(entry,'closed'),open=localBox(entry,'open');
   const min=closed.min.clone().lerp(open.min,fraction),max=closed.max.clone().lerp(open.max,fraction),bounds=new THREE.Box3(min,max),size=bounds.getSize(new THREE.Vector3());
   size.x=Math.max(size.x,.09);size.y=Math.max(size.y,.09);size.z=Math.max(size.z,.055);
   entry.proxy.position.copy(bounds.getCenter(new THREE.Vector3()));entry.proxy.scale.copy(size);entry.proxy.visible=doorOpen||selected;
  }
 }
 const ready=fetch('assets/desk-video-details-manifest.json',{cache:'no-cache'}).then(r=>{if(r.ok===false)throw Error('Cabinet manifest unavailable');return r.json();}).then(data=>{
  for(const source of data.items){const spec={...source},object=asset.getObjectByName(spec.root);if(!object)continue;
   if(object.userData.inspectionBounds)spec.geometryBounds=object.userData.inspectionBounds;
   if(spec.type==='optional_scroll'){object.visible=true;object.position.set(-1.67,2.27,-1.255);spec.type='scroll';}
   const entry={spec,object,rest:pose(object),hinge:spec.hinge?object.getObjectByName(spec.hinge):null};
   if(entry.hinge)entry.hingeRest=entry.hinge.quaternion.clone();
   measureBounds(entry);entries.set('detail:'+spec.root,entry);
   if(spec.type==='brush'){object.userData.tipLocal=spec.tipLocal;mark(object,'brush:'+spec.root);}else mark(object,'detail:'+spec.root);
   if(spec.type==='door')door=entry;
   if(spec.type==='folding_fan'){
    const proxy=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false,side:THREE.DoubleSide}));
    proxy.name='FoldingFanHitProxy';proxy.userData.cabinetHitProxy=true;proxy.userData.action='detail:'+spec.root;proxy.castShadow=proxy.receiveShadow=false;object.add(proxy);entry.proxy=proxy;
   }
  }changed();
 });

 function buildRoute(entry){
  entry.object.updateWorldMatrix(true,true);const origin=entry.object.getWorldPosition(new THREE.Vector3()),rest=copyPose(entry.rest),route=[rest];
  const bag=entries.get('detail:JordanBackpackRoot'),bagBox=bag?worldBox(bag,'swept'):new THREE.Box3(new THREE.Vector3(-1.95,1.1,-.8),new THREE.Vector3(-1.25,2.8,.1));
  const closed=worldBox(entry,'closed'),offsetMin=closed.min.clone().sub(origin),offsetMax=closed.max.clone().sub(origin);
  if(entry.spec.type==='scroll'){
   // Stay behind the bag until the WHOLE scroll is above it, then move forward
   // and lower. The exact reverse route is also clear on the way back.
   const obstacleTop=Math.max(bagBox.max.y,door?worldBox(door,'closed').max.y:-Infinity);
   const high=Math.max(origin.y,obstacleTop-offsetMin.y+GAP);
   const front=Math.max(origin.z+.75,bagBox.max.z-offsetMin.z+GAP+.25,1.3+closed.getSize(new THREE.Vector3()).length()*.5);
   route.push(worldPose(entry,new THREE.Vector3(origin.x,high,origin.z)),worldPose(entry,new THREE.Vector3(origin.x,high,front)),worldPose(entry,new THREE.Vector3(origin.x,origin.y,front)));
  }else if(entry.spec.type==='folding_fan'){
   const b=localBox(entry,'swept'),radius=Math.max(b.min.length(),b.max.length());
   // Small vertical clearance prevents dragging its paper through the cabinet
   // floor. Rotation and unfolding begin only after the whole swept fan fits
   // in front of both the cabinet face and the full backpack flap envelope.
   const doorFloor=door?worldBox(door,'closed').min.y:closed.min.y;
   const lifted=origin.clone();lifted.y+=Math.max(.035,doorFloor-closed.min.y+.022);
   const front=lifted.clone();front.z=Math.max(origin.z+.75,bagBox.max.z+radius+GAP,1.30+radius);
   route.push(worldPose(entry,lifted),worldPose(entry,front),worldPose(entry,front,new THREE.Quaternion()));
  }else{
   const target=origin.clone();target.z=Math.max(origin.z+.75,1.3+worldBox(entry,'open').getSize(new THREE.Vector3()).length()*.5);route.push(worldPose(entry,target));
  }
  return route;
 }
 function changeDoor(opened,done,{focus=false}={}){
  if(!door){done?.();return;}
  const id=generation,from=door.object.rotation.y,to=opened?door.spec.open:0;doorTarget=opened;doorActive=true;setBusy(true);
  const start=()=>animate(.68,t=>door.object.rotation.y=THREE.MathUtils.lerp(from,to,t),()=>{doorOpen=opened;doorActive=opened;changed();done?.();});
  if(focus){const look=new THREE.Vector3(-.83,2.25,-.68);cameraTo(look.clone().add(new THREE.Vector3(.02,.06,camera.aspect<.85?1.65:1.25)),look,.7,start,id);}else start();
 }
 function showDoor(){
  const opened=!doorTarget;++generation;tween=null;cameraPending=false;if(opened&&!doorOpen)doorView=captureView();
  changeDoor(opened,()=>{setBusy(false);drain();},{focus:true});return true;
 }
 function ensureOpen(done){
  if(current){close(()=>ensureOpen(done),{restoreView:false});return true;}
  if(doorOpen){done?.();return true;}
  ++generation;tween=null;cameraPending=false;changeDoor(true,()=>{setBusy(false);done?.();drain();});return true;
 }
 function inspectionView(context){
  if(context.entry.object){
   const object=context.entry.object;object.updateWorldMatrix(true,true);
   if(!context.rotationEnvelope){const b=new THREE.Box3().setFromObject(object);context.rotationEnvelope={anchor:object.worldToLocal(b.getCenter(new THREE.Vector3())),radius:b.getSize(new THREE.Vector3()).length()*.5};}
   const envelope=context.rotationEnvelope,center=object.localToWorld(envelope.anchor.clone());
   const half=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
   const distance=envelope.radius*1.10/Math.sin(half);
   // Fit the full rotation sphere of every object, including the unfolded fan.
   // A narrow screen needs more viewing distance than the front wall permits;
   // use the room's lateral space, instead of sending the eye outside the wall.
   let fallback=null;
   for(const angle of [0,15,-15,30,-30,45,-45,60,-60,75,-75,90,-90]){
    const yaw=THREE.MathUtils.degToRad(angle),requested=center.clone().add(new THREE.Vector3(Math.sin(yaw)*distance,.035,Math.cos(yaw)*distance));
    const position=constrainCameraPosition(requested);
    if(position.distanceToSquared(requested)<1e-10)return {look:center,position};
    if(!fallback||position.distanceTo(center)>fallback.position.distanceTo(center))fallback={look:center,position};
   }
   return fallback;
  }
  const {entry}=context,bounds=worldBox(entry,'open'),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const dist=Math.max(.65,Math.max(size.y,size.x/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.34+size.z*.5);
  return {look:center,position:center.clone().add(new THREE.Vector3(0,entry.spec.type==='box'?.25:.035,dist))};
 }
 function start(entry,action,onReady){
  const context={entry,action,entryView:captureView(),phase:'preview-camera',openFraction:0,visited:[copyPose(entry.rest)],ready:onReady,closeCallbacks:[]};current=context;
  const id=++generation;setBusy(true);caption('');
  const extract=()=>{if(current!==context||id!==generation)return;context.route=buildRoute(entry);context.phase='extracting';
   playRoute(context,context.route.slice(1),()=>{context.phase='opening';animate(.75,t=>setOpen(context,t),()=>{context.phase='camera';const view=inspectionView(context);cameraTo(view.position,view.look,.75,()=>{context.turnPose=captureInspectionPose(entry.object);context.phase='open';setBusy(false);context.ready?.(true);drain();},id);});},{remember:true});
  };
  // Preview the item at its rest location first. Reserve enough distance for
  // the final opened shape so extraction cannot pass through the camera.
  const bounds=worldBox(entry,'closed'),center=bounds.getCenter(new THREE.Vector3());
  const route=buildRoute(entry),last=route.at(-1),matrix=new THREE.Matrix4().compose(last.position,last.quaternion,entry.object.scale);
  if(entry.object.parent)matrix.premultiply(entry.object.parent.matrixWorld);
  const finalBounds=localBox(entry,'open').applyMatrix4(matrix),finalCenter=finalBounds.getCenter(new THREE.Vector3()),size=finalBounds.getSize(new THREE.Vector3());
  const fit=Math.max(.65,Math.max(size.y+2*Math.abs(finalCenter.y-center.y),(size.x+2*Math.abs(finalCenter.x-center.x))/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.34);
  const position=center.clone();position.y+=.035;position.z=Math.max(center.z+.65,finalBounds.max.z+fit);
  cameraTo(position,center,.75,()=>{if(current!==context||id!==generation)return;if(!doorOpen&&door?.spec.inside.includes(entry.spec.root)){context.phase='opening-door';changeDoor(true,extract);}else extract();},id);
 }
 function drain(){const next=pending;if(!next||busy)return;pending=null;open(next.action,next.onReady);}
 function open(action,onReady){
  const entry=entries.get(action);if(!entry)return false;
  if(current?.action===action&&current.phase!=='closing'){if(current.phase==='open')onReady?.(true);return true;}
  if(current){pending={action,onReady};close(null,{restoreView:false,preservePending:true});return true;}
  if(entry===door||entry.spec.type==='brush_rack')return showDoor();
  if(tween||cameraPending){pending={action,onReady};return true;}
  start(entry,action,onReady);return true;
 }
 function close(done,{restoreView=true,preservePending=false}={}){
  if(!preservePending)pending=null;
  if(!current){
   if(!doorActive&&!doorOpen&&!tween&&!cameraPending){done?.();return false;}
   ++generation;tween=null;cameraPending=false;
   const view=doorView;changeDoor(false,()=>{doorView=null;const finish=()=>{setBusy(false);done?.();drain();};if(restoreView&&view)cameraTo(view.position,view.look,.6,finish);else finish();});return true;
  }
  const context=current;if(done)context.closeCallbacks.push(done);if(context.phase==='closing'){if(!restoreView)context.restoreView=false;return true;}
  const interruptedDoor=context.phase==='opening-door';
  context.phase='closing';context.restoreView=restoreView;context.ready=null;++generation;tween=null;cameraPending=false;setBusy(true);caption('');
  const finish=()=>{if(current!==context)return;const o=context.entry.object;o.position.copy(context.entry.rest.position);o.quaternion.copy(context.entry.rest.quaternion);setOpen(context,0);current=null;changed();setBusy(false);context.closeCallbacks.forEach(fn=>fn?.());drain();};
  const restoreCamera=()=>{if(context.restoreView&&context.entryView)cameraTo(context.entryView.position,context.entryView.look,.65,finish);else finish();};
  const afterRoute=()=>{if(interruptedDoor)changeDoor(false,restoreCamera);else restoreCamera();};
  const returnRoute=()=>{
   // Only reverse reached waypoints. A partially travelled segment first goes
   // back to its previous endpoint; it never jumps ahead to an unreached pose.
   const route=context.visited.slice().reverse().map(copyPose);
   playRoute(context,route,afterRoute);
  };
  const fold=()=>{const from=context.openFraction;animate(.55,t=>setOpen(context,from*(1-t)),returnRoute);};
  // Undo user rotation before folding, then reverse the smooth pose route.
  const last=context.visited.at(-1),object=context.entry.object;
  if(context.turnPose&&(object.quaternion.angleTo(last.quaternion)>1e-5||object.position.distanceTo(last.position)>1e-5))moveTo(context,copyPose(last),.38,fold);else fold();
  return true;
 }
 function rotate(yaw,pitch=0){if(current?.phase!=='open')return false;turnInspectionObject(current.entry.object,current.turnPose,yaw,pitch);changed();return true;}
 function refit(){if(current?.phase!=='open'||busy)return false;const view=inspectionView(current);setBusy(true);cameraTo(view.position,view.look,.4,()=>{setBusy(false);drain();});return true;}
 function update(dt){if(!tween)return false;const a=tween;a.time+=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.10));const t=Math.min(1,a.time/a.duration);a.frame(ease(t));changed();if(t===1&&tween===a){tween=null;a.done?.();}return true;}
 return {ready,canOpen:action=>entries.has(action),open,close,ensureOpen,rotate,refit,update,
  get active(){return current?.action||(doorActive||doorOpen?DOOR:null);},get object(){return current?.entry.object||null;},get doorOpen(){return doorOpen;},get busy(){return busy;}};
}
