import {Box3,Vector3,Triangle} from './vendor/three.module.js';

// Pure translation uses continuous SAT between the actual thin sheet box and
// each nearby physical triangle. Rotation is admitted only inside a clear
// enclosing sphere. No full furniture bounding box is treated as solid.
export function createArchivePaperGuard(scene,camera){
 const localCache=new WeakMap(),meshCache=new WeakMap();
 const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
 function shape(object,position=object.position){
  object.updateWorldMatrix(true,true);let box=localCache.get(object);
  if(!box){box=new Box3();const inverse=object.matrixWorld.clone().invert(),v=new Vector3();object.traverse(m=>{if(!m.isMesh)return;for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,v);box.expandByPoint(v.applyMatrix4(m.matrixWorld).applyMatrix4(inverse));}});localCache.set(object,box);}
  const matrix=object.matrixWorld.clone(),world=object.parent?object.parent.localToWorld(position.clone()):position.clone();matrix.setPosition(world);
  const center=box.getCenter(new Vector3()).applyMatrix4(matrix),axes=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)].map(a=>a.transformDirection(matrix)),half=box.getSize(new Vector3()).multiply(object.getWorldScale(new Vector3())).multiplyScalar(.5),corners=[];
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push(center.clone().addScaledVector(axes[0],half.x*x).addScaledVector(axes[1],half.y*y).addScaledVector(axes[2],half.z*z));
  return {center,axes,half,corners,radius:half.length()};
 }
 function meshesNear(bounds,object){const result=[];scene.updateMatrixWorld(true);scene.traverse(mesh=>{if(!mesh.isMesh||!visible(mesh)||mesh.userData.pickThrough||mesh.userData.cabinetHitProxy||mesh.userData.cameraCollision===false)return;for(let p=mesh;p;p=p.parent)if(p===object)return;
   const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(materials.every(m=>m.opacity<=.2&&!(m.transmission>0)))return;
   let entry=meshCache.get(mesh);if(!entry||entry.geometry!==mesh.geometry||entry.positionAttribute!==mesh.geometry.attributes.position||entry.indexAttribute!==mesh.geometry.index||entry.positionVersion!==mesh.geometry.attributes.position.version||entry.indexVersion!==(mesh.geometry.index?.version??-1)||!entry.matrix.equals(mesh.matrixWorld)){const box=new Box3().setFromObject(mesh,true);entry={box,matrix:mesh.matrixWorld.clone(),geometry:mesh.geometry,positionAttribute:mesh.geometry.attributes.position,indexAttribute:mesh.geometry.index,positionVersion:mesh.geometry.attributes.position.version,indexVersion:mesh.geometry.index?.version??-1,triangles:null};meshCache.set(mesh,entry);}if(!entry.box.intersectsBox(bounds))return;
   if(!entry.triangles){const g=mesh.geometry,index=g.index,p=g.attributes.position,count=index?index.count:p.count;entry.triangles=[];for(let i=0;i<count;i+=3){const vertices=[];for(let j=0;j<3;j++){const v=new Vector3();mesh.getVertexPosition(index?index.getX(i+j):i+j,v);vertices.push(v.applyMatrix4(mesh.matrixWorld));}entry.triangles.push(vertices);}}
   result.push({name:mesh.name,...entry});});return result;}
 function wallAndNear(points){camera.updateWorldMatrix(true,false);for(const p of points){if(p.x< -3.837||p.x>3.837||p.y<.013||p.y>4.697||p.z< -1.307||p.z>4.797)return false;if(-p.clone().applyMatrix4(camera.matrixWorldInverse).z<camera.near+.003)return false;}return true;}
 function intersectsDuring(s,delta,vertices){
  const [a,b,c]=vertices,edges=[b.clone().sub(a),c.clone().sub(b),a.clone().sub(c)],normal=edges[0].clone().cross(edges[1]),axes=[...s.axes,normal,...s.axes.flatMap(axis=>edges.map(edge=>axis.clone().cross(edge)))];let low=0,high=1;
  for(const axis of axes){if(axis.lengthSq()<1e-18)continue;axis.normalize();const r=s.half.x*Math.abs(s.axes[0].dot(axis))+s.half.y*Math.abs(s.axes[1].dot(axis))+s.half.z*Math.abs(s.axes[2].dot(axis))+.0005,cp=s.center.dot(axis),values=vertices.map(v=>v.dot(axis)),lo=Math.min(...values)-r-cp,hi=Math.max(...values)+r-cp,speed=delta.dot(axis);
   if(Math.abs(speed)<1e-12){if(lo>0||hi<0)return false;}else{const t0=lo/speed,t1=hi/speed;low=Math.max(low,Math.min(t0,t1));high=Math.min(high,Math.max(t0,t1));if(low>high)return false;}}
  return high>=0&&low<=1;
 }
 function move(object,position){const start=shape(object),end=shape(object,position);if(!wallAndNear([...start.corners,...end.corners]))return false;const delta=end.center.clone().sub(start.center),bounds=new Box3().setFromPoints([...start.corners,...end.corners]).expandByScalar(.001);
  for(const entry of meshesNear(bounds,object))for(const triangle of entry.triangles)if(intersectsDuring(start,delta,triangle))return false;return true;}
 function sphere(object,center,radius){const box=new Box3(center.clone().addScalar(-radius-.002),center.clone().addScalar(radius+.002)),points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new Vector3(x,y,z));if(!wallAndNear(points))return false;const v=new Vector3(),triangle=new Triangle();for(const entry of meshesNear(box,object))for(const t of entry.triangles){triangle.set(...t);triangle.closestPointToPoint(center,v);if(v.distanceTo(center)<radius+.002)return false;}return true;}
 return {move,sphere,shape};
}
