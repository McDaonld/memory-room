import {Vector3,Quaternion,Euler,Box3} from './vendor/three.module.js';

// Spins an object about its actual geometry centre, even when exported with
// a world-zero origin. No clamps, Euler accumulation or object rescaling.
export function captureInspectionPose(object,{preserveZoomBaseline=false,camera=null}={}){
 object.updateWorldMatrix(true,true);
 const pose={position:object.position.clone(),quaternion:object.quaternion.clone(),anchor:object.worldToLocal(new Box3().setFromObject(object,Boolean(object.userData.nativeCS2Animation)).getCenter(new Vector3()))};
 if(!preserveZoomBaseline||!zoomBaselines.has(object))zoomBaseline(object,pose.anchor);
 if(preserveZoomBaseline&&camera){
  camera.updateWorldMatrix(true,false);const baseline=zoomBaselines.get(object);
  // A caller preserving its physical stage across projection-only resize also
  // acknowledges the new signature; keep center, anchor and radius untouched.
  baseline.cameraWorld=camera.matrixWorld.clone();baseline.projection=camera.projectionMatrix.clone();
 }
 return pose;
}
export function turnInspectionObject(object,pose,yaw,pitch){
 object.updateWorldMatrix(true,true);const center=object.localToWorld(pose.anchor.clone());
 const q=object.getWorldQuaternion(new Quaternion());q.premultiply(new Quaternion().setFromEuler(new Euler(pitch,yaw,0,'YXZ')));
 const parentQ=object.parent?.getWorldQuaternion(new Quaternion())||new Quaternion();
 object.quaternion.copy(parentQ.invert().multiply(q));object.updateWorldMatrix(true,true);
 const origin=object.getWorldPosition(new Vector3()).add(center.sub(object.localToWorld(pose.anchor.clone())));
 object.position.copy(object.parent?object.parent.worldToLocal(origin):origin);object.updateWorldMatrix(true,true);
}
export function zoomInspection(camera,look,delta,radius=.15){
 const direction=camera.position.clone().sub(look),old=direction.length();
 const min=Math.max(camera.near*4,radius*.32),max=Math.max(3,radius*12);
 const distance=Math.max(min,Math.min(max,old*Math.exp(Math.max(-400,Math.min(400,delta))*.0013)));
 camera.position.copy(look).addScaledVector(direction.normalize(),distance);camera.lookAt(look);return distance;
}

const zoomBaselines=new WeakMap();
// Inner wall faces in the current room. Keep the entire rotating object eight
// millimetres clear; the camera itself is neither moved nor clamped here.
const ZOOM_ROOM_MIN=new Vector3(-3.84,.01,-1.31),ZOOM_ROOM_MAX=new Vector3(3.84,4.70,4.80),ZOOM_CLEARANCE=.008;
function rotationRadius(object,center){
 let radius=0;const p=new Vector3();
 object.traverse(m=>{if(!m.isMesh||m.userData.cabinetHitProxy||m.userData.pickThrough)return;
  for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,p);p.applyMatrix4(m.matrixWorld);radius=Math.max(radius,p.distanceTo(center));}
 });
 const sweep=object.userData.inspectionSweep;
 if(sweep?.center&&Number.isFinite(sweep.radius)){
  const c=object.localToWorld(new Vector3(...sweep.center)),scale=object.getWorldScale(new Vector3());
  radius=Math.max(radius,center.distanceTo(c)+sweep.radius*Math.max(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z)));
 }
 return radius;
}
export function resetInspectionZoom(object){zoomBaselines.delete(object);}
function zoomBaseline(object,anchor){
 const center=object.localToWorld(anchor.clone());
 const baseline={anchor:anchor.clone(),center,radius:rotationRadius(object,center),cameraWorld:null,projection:null};
 zoomBaselines.set(object,baseline);return baseline;
}

// Keep the camera fixed and preserve object scale. The farthest permitted
// point is the session's safe extracted stage, never the back of the room.
export function magnifyInspectionObject(object,camera,delta){
 if(!Number.isFinite(delta))return false;
 object.updateWorldMatrix(true,true);camera.updateWorldMatrix(true,false);
 let baseline=zoomBaselines.get(object);
 if(!baseline){const center=new Box3().setFromObject(object,Boolean(object.userData.nativeCS2Animation)).getCenter(new Vector3());baseline=zoomBaseline(object,object.worldToLocal(center));}
 const currentCenter=object.localToWorld(baseline.anchor.clone());
 if(baseline.cameraWorld&&(!baseline.cameraWorld.equals(camera.matrixWorld)||!baseline.projection.equals(camera.projectionMatrix))){
  // resize/refit establishes a fresh safe stage in the newly fitted view.
  baseline.center.copy(currentCenter);
 }
 baseline.cameraWorld=camera.matrixWorld.clone();baseline.projection=camera.projectionMatrix.clone();
 const forward=camera.getWorldDirection(new Vector3()),offset=baseline.center.clone().sub(camera.position),stageDepth=offset.dot(forward),currentDepth=currentCenter.clone().sub(camera.position).dot(forward);
 if(stageDepth<=0||currentDepth<=0)return false;
 const radius=baseline.radius,near=Math.max(camera.near*4,radius+camera.near*2);
 let lo=Math.max(0,near/stageDepth),hi=1;
 for(const key of ['x','y','z']){
  const min=ZOOM_ROOM_MIN[key]+radius+ZOOM_CLEARANCE,max=ZOOM_ROOM_MAX[key]-radius-ZOOM_CLEARANCE,d=offset[key],origin=camera.position[key];
  if(min>max)return false;
  if(Math.abs(d)<1e-12){if(origin<min||origin>max)return false;continue;}
  const a=(min-origin)/d,b=(max-origin)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
 }
 if(lo>hi+1e-10)return false;
 const wanted=currentDepth*Math.exp(Math.max(-400,Math.min(400,delta))*.0013)/stageDepth;
 const t=Math.max(lo,Math.min(hi,wanted)),center=camera.position.clone().addScaledVector(offset,t);
 const world=object.getWorldPosition(new Vector3()).add(center.sub(currentCenter));
 object.position.copy(object.parent?object.parent.worldToLocal(world):world);object.updateWorldMatrix(true,true);return true;
}
