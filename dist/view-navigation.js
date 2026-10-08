import { Vector3 } from './vendor/three.module.js';

export function copyView(view){return {position:view.position.clone(),look:view.look.clone(),mode:view.mode||'home',fov:view.fov??52};}

export function isReturnCorner(x,y,width,height){
  const edge=Math.max(44,Math.min(76,Math.min(width,height)*.09));
  return (x<=edge||x>=width-edge)&&(y<=edge||y>=height-edge);
}

// Inside the finished wall/floor/ceiling surfaces, with space for the near plane.
export const ROOM_CAMERA_BOUNDS=Object.freeze({minX:-3.60,maxX:3.60,minY:.20,maxY:4.45,minZ:-1.05,maxZ:4.55});
export const ORBIT_PITCH_LIMITS=Object.freeze({min:-.22,max:.58});
export function constrainCameraPosition(position,{frontOfDesk=false}={}){
  const b=ROOM_CAMERA_BOUNDS;
  return new Vector3(Math.max(b.minX,Math.min(b.maxX,position.x)),Math.max(b.minY,Math.min(b.maxY,position.y)),Math.max(frontOfDesk?.42:b.minZ,Math.min(b.maxZ,position.z)));
}

// A gesture always starts from a frozen camera pose. Repeated moves therefore
// do not accumulate a drift or snap to the front-facing home coordinates.
export function orbitView(view,deltaX,deltaY=0,{height=720}={}){
  if(!Number.isFinite(deltaX)||!Number.isFinite(deltaY))return {position:view.position.clone(),look:view.look.clone()};
  const offset=view.position.clone().sub(view.look),radius=offset.length();
  const original=Math.atan2(offset.x,offset.z);
  const yaw=Math.max(-1.35,Math.min(1.35,original-deltaX*.004));
  const originalPitch=Math.atan2(offset.y,Math.hypot(offset.x,offset.z));
  // Absolute limits prevent repeated gestures from walking the eye toward the
  // ceiling. A pre-existing angled close-up may return toward this range without
  // jumping on the first horizontal drag or tilting farther away from it.
  const low=Math.min(ORBIT_PITCH_LIMITS.min,originalPitch),high=Math.max(ORBIT_PITCH_LIMITS.max,originalPitch);
  const sensitivity=1.10/Math.max(360,Math.min(1440,height));
  const pitch=Math.max(low,Math.min(high,originalPitch-deltaY*sensitivity)),horizontal=radius*Math.cos(pitch);
  const position=new Vector3(view.look.x+Math.sin(yaw)*horizontal,view.look.y+Math.sin(pitch)*radius,view.look.z+Math.cos(yaw)*horizontal);
  return {position:constrainCameraPosition(position,{frontOfDesk:true}),look:view.look.clone()};
}
