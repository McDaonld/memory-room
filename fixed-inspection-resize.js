import {Box3,Vector3,MathUtils} from './vendor/three.module.js';

// The currently verified caller is BUVCard. A rejected fit leaves both object
// and camera untouched; never fall back to camera motion or object scaling.
export function planFixedInspectionResize({object,anchor,camera,clearance,margin=.92}){
 object.updateWorldMatrix(true,true);camera.updateWorldMatrix(true,false);
 const center=anchor?object.localToWorld(anchor.clone()):new Box3().setFromObject(object).getCenter(new Vector3());
 let radius=0;const point=new Vector3();
 object.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.cabinetHitProxy||mesh.userData.pickThrough)return;
  for(let p=mesh;p&&p!==object;p=p.parent)if(!p.visible)return;
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);radius=Math.max(radius,point.distanceTo(center));}
 });
 const forward=camera.getWorldDirection(new Vector3()),tan=Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()/2));
 const half=Math.atan(Math.min(tan,tan*camera.aspect)*margin),depth=Math.max(radius/Math.sin(half),radius+camera.near+.01);
 const destination=camera.getWorldPosition(new Vector3()).addScaledVector(forward,depth),travel=center.distanceTo(destination);
 for(const [key,lo,hi]of [['x',-3.84,3.84],['y',.01,4.70],['z',-1.31,4.80]])if(destination[key]-radius<lo+.008||destination[key]+radius>hi-.008)return {ok:false,reason:'room-envelope'};
 if(travel>1e-7){
  if(!clearance)return {ok:false,reason:'missing-external-clearance'};
  const visible=object.visible;object.visible=false;
  let forwardFree,reverseFree;
  try{forwardFree=clearance.stopDistance(center,destination,radius+.003);reverseFree=clearance.stopDistance(destination,center,radius+.003);}
  finally{object.visible=visible;}
  if(Math.min(forwardFree,reverseFree)<travel-1e-7)return {ok:false,reason:'external-geometry',travel,forwardFree,reverseFree};
 }
 const worldOrigin=object.getWorldPosition(new Vector3()).add(destination.clone().sub(center));
 return {ok:true,position:object.parent?object.parent.worldToLocal(worldOrigin):worldOrigin,center:destination,radius,travel};
}
