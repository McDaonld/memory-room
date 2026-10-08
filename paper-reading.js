import {fitPageFocus,panPageFocus,zoomPageFocus} from './book-single-page-focus.js?v=20261007-overnight1';

// Reading acts on the SAME physical sheet. The camera, model scale and the
// inspector's original return route are never changed here.
export function createPaperReading({THREE,camera,viewport,onChange=()=>{},onBusy=()=>{},reduced=false}){
 let state=null,tween=null;
 const pose=object=>({position:object.position.clone(),quaternion:object.quaternion.clone()});
 function options(){
  camera.updateWorldMatrix(true,false);
  return {bounds:state.bounds,camera:{position:camera.getWorldPosition(new THREE.Vector3()).toArray(),quaternion:camera.getWorldQuaternion(new THREE.Quaternion()).toArray(),fov:camera.getEffectiveFOV(),aspect:camera.aspect,near:camera.near},viewport:viewport(),marginPx:22,zoom:state.zoom,panPixels:state.pan};
 }
 function local(fit){
  const p=new THREE.Vector3(...fit.position),q=new THREE.Quaternion(...fit.quaternion),parent=state.object.parent;
  if(parent){parent.updateWorldMatrix(true,false);parent.worldToLocal(p);q.premultiply(parent.getWorldQuaternion(new THREE.Quaternion()).invert());}
  return {position:p,quaternion:q};
 }
 function place(target){state.object.position.copy(target.position);state.object.quaternion.copy(target.quaternion);state.object.updateWorldMatrix(true,true);onChange();}
 function accept(fit){state.zoom=fit.effectiveZoom;state.pan=fit.panPixels;return local(fit);}
 function atAnchor(anchor,quaternion){
  const object=state.object,parent=object.parent;
  parent?.updateWorldMatrix(true,false);
  const position=parent?parent.worldToLocal(anchor.clone()):anchor.clone();
  position.sub(state.anchor.clone().multiply(object.scale).applyQuaternion(quaternion));
  return {position,quaternion:quaternion.clone()};
 }
 function animate(to,done,intent='reading'){
  const object=state.object,from=pose(object),stages=[];
  state.intent=intent;object.updateWorldMatrix(true,true);camera.updateWorldMatrix(true,false);
  if(from.quaternion.angleTo(to.quaternion)>1e-7){
   const center=object.localToWorld(state.anchor.clone()),vertex=new THREE.Vector3();let radius=0;
   object.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry?.attributes.position;if(!p)return;
    for(let i=0;i<p.count;i++){mesh.getVertexPosition(i,vertex);vertex.applyMatrix4(mesh.matrixWorld);radius=Math.max(radius,vertex.distanceTo(center));}
   });
   // Retreat face-on before turning. The same actual-geometry sphere protects
   // both entry from a magnified 360 view and exit from a near reading pan.
   const eye=camera.getWorldPosition(new THREE.Vector3()),forward=camera.getWorldDirection(new THREE.Vector3());
   const targetAnchor=state.anchor.clone().multiply(object.scale).applyQuaternion(to.quaternion).add(to.position);
   object.parent?.localToWorld(targetAnchor);
   const safeDepth=Math.max(radius+camera.near+.008,center.clone().sub(eye).dot(forward),targetAnchor.sub(eye).dot(forward));
   const safeCenter=eye.clone().addScaledVector(forward,safeDepth);
   const first=atAnchor(safeCenter,from.quaternion),last=atAnchor(safeCenter,to.quaternion);
   stages.push({from,to:first,d:reduced?.04:.18},
    {from:first,to:last,d:reduced?.04:.24,anchor:safeCenter},
    {from:last,to,d:reduced?.04:.18});
  }else stages.push({from,to,d:reduced?.12:.35});
  tween={stages,index:0,time:0,done};onBusy(true);onChange();
 }
 function fit(animated=false){if(!state)return false;const target=accept(fitPageFocus(options()));if(animated)animate(target);else place(target);return true;}
 function open(object,bounds){
  if(state||!object)return false;
  state={object,bounds,anchor:new THREE.Vector3(...bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(.5),inspectionPose:pose(object),intent:'reading',zoom:1,pan:[0,0]};fit(true);return true;
 }
 function inspect(){
  if(!state||tween)return false;
  animate(state.inspectionPose,()=>{state=null;onChange();},'inspection');return true;
 }
 // Cancellation leaves the present pose intact for inspector.close() to
 // animate back; snapping to the saved pose here would cause a visible jump.
 function cancel(){if(!state)return false;state=null;tween=null;onBusy(false);onChange();return true;}
 function pan(x,y){if(!state||tween)return false;place(accept(panPageFocus(options(),x,y)));return true;}
 function zoom(delta){if(!state)return false;if(tween)return true;place(accept(zoomPageFocus(options(),delta)));return true;}
 function update(dt){
  if(!tween||!state)return false;const a=tween;let remaining=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  while(tween===a&&state){
   const stage=a.stages[a.index],step=Math.min(remaining,stage.d-a.time);a.time+=step;remaining-=step;
   const p=Math.min(1,a.time/stage.d),k=p*p*(3-2*p);
   const quaternion=stage.from.quaternion.clone().slerp(stage.to.quaternion,k);
   const target=stage.anchor?atAnchor(stage.anchor,quaternion):{position:stage.from.position.clone().lerp(stage.to.position,k),quaternion};place(target);
   if(p<1)break;
   if(++a.index===a.stages.length){tween=null;a.done?.();onBusy(false);onChange();break;}
   a.time=0;if(remaining<=0)break;
  }return true;
 }
 return {open,inspect,cancel,pan,zoom,update,resize(){
  if(!state)return false;
  // Returning is an explicit user intent, not an opening fit. Keep its target
  // and completion callback through projection-only viewport changes.
  if(state.intent==='inspection')return true;
  return fit(Boolean(tween));
 },get active(){return Boolean(state);},get busy(){return Boolean(tween);},get object(){return state?.object||null;},get view(){return state?{zoom:state.zoom,pan:[...state.pan]}:null;}};
}
