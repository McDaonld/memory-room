import {Box3,Matrix4,Triangle,Vector3} from './vendor/three.module.js';
import {constrainCameraPosition} from './view-navigation.js?v=20261007-overnight1';

// Exact continuous sphere/triangle contact after a cached local BVH broad phase.
// The BVH is shared by meshes using the same geometry; world triangles are only
// transformed for nearby leaves. No giant furniture AABB is treated as solid.
const EPS=1e-8,SKIN=.0008;
function segmentMeetsBox(from,to,box,padding){
 let low=0,high=1;for(let i=0;i<3;i++){const pad=typeof padding==='number'?padding:padding.getComponent(i),p=from.getComponent(i),d=to.getComponent(i)-p,min=box.min.getComponent(i)-pad,max=box.max.getComponent(i)+pad;if(Math.abs(d)<EPS){if(p<min||p>max)return false;continue;}let a=(min-p)/d,b=(max-p)/d;if(a>b){const t=a;a=b;b=t;}low=Math.max(low,a);high=Math.min(high,b);if(low>high)return false;}return true;
}
function geometryTree(geometry){
 const position=geometry.attributes.position,index=geometry.index,count=Math.floor((index?index.count:position.count)/3);
 const ids=new Uint32Array(count),bounds=new Float64Array(count*6),centers=new Float64Array(count*3),v=new Vector3();
 for(let i=0;i<count;i++){
  ids[i]=i;const b=i*6;bounds[b]=bounds[b+1]=bounds[b+2]=Infinity;bounds[b+3]=bounds[b+4]=bounds[b+5]=-Infinity;
  for(let j=0;j<3;j++){v.fromBufferAttribute(position,index?index.getX(i*3+j):i*3+j);for(let a=0;a<3;a++){const n=v.getComponent(a);bounds[b+a]=Math.min(bounds[b+a],n);bounds[b+a+3]=Math.max(bounds[b+a+3],n);}}
  for(let a=0;a<3;a++)centers[i*3+a]=(bounds[b+a]+bounds[b+a+3])*.5;
 }
 function split(lo,hi,mid,axis){
  while(lo<hi){const pivot=centers[ids[(lo+hi)>>1]*3+axis];let i=lo,j=hi;
   while(i<=j){while(centers[ids[i]*3+axis]<pivot)i++;while(centers[ids[j]*3+axis]>pivot)j--;if(i<=j){const x=ids[i];ids[i++]=ids[j];ids[j--]=x;}}
   if(mid<=j)hi=j;else if(mid>=i)lo=i;else break;
  }
 }
 function build(start,end){
  const box=new Box3();for(let i=start;i<end;i++){const b=ids[i]*6;box.min.min(v.set(bounds[b],bounds[b+1],bounds[b+2]));box.max.max(v.set(bounds[b+3],bounds[b+4],bounds[b+5]));}
  const node={box,start,end};if(end-start>16){const size=box.getSize(v),axis=size.x>=size.y&&size.x>=size.z?0:size.y>=size.z?1:2,mid=(start+end)>>1;split(start,end-1,mid,axis);node.left=build(start,mid);node.right=build(mid,end);}return node;
 }
 return {root:count?build(0,count):null,ids,position,index,version:position.version,count};
}

export function createCameraClearance(scene,{radius=.105}={}){
 const entries=[],trees=new WeakMap(),stats={meshes:0,triangles:0,queries:0,narrowTriangles:0,bvhNodes:0},inverse=new Matrix4();
 const worldSweep=new Box3(),localFrom=new Vector3(),localTo=new Vector3(),localRadius=new Vector3(),closest=new Vector3(),a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3(),contact=new Vector3(),edge=new Vector3(),offset=new Vector3(),probe=new Vector3(),triangle=new Triangle();
 let invalid=true;
 function refresh(){
  if(!invalid)return;entries.length=0;stats.triangles=0;
  scene.updateMatrixWorld(true);
  scene.traverse(mesh=>{
   if(!mesh.isMesh||mesh.isSkinnedMesh||!mesh.geometry?.attributes.position||mesh.userData.pickThrough||mesh.userData.cabinetHitProxy||mesh.userData.cameraCollision===false)return;
   const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   // Transmissive glass is still a physical surface. Near-invisible hit proxies
   // are skipped; opacity is not a proxy for paper/wood material sidedness.
   if(materials.every(m=>!m||(m.opacity<=.2&&!(m.transmission>0))))return;
   let tree=trees.get(mesh.geometry);if(!tree||tree.version!==mesh.geometry.attributes.position.version){tree=geometryTree(mesh.geometry);trees.set(mesh.geometry,tree);}
   if(!tree.root)return;entries.push({mesh,tree,box:new Box3(),matrix:new Matrix4().makeScale(0,0,0)});stats.triangles+=tree.count;
  });stats.meshes=entries.length;invalid=false;
 }
 function visible(mesh){for(let p=mesh;p;p=p.parent)if(!p.visible)return false;return true;}
 function sphereRoot(origin,direction,center,r,limit){
  offset.copy(origin).sub(center);const bb=offset.dot(direction),cc=offset.lengthSq()-r*r,disc=bb*bb-cc;if(disc<0)return limit;
  const t=-bb-Math.sqrt(disc);return t>=-EPS&&t<=limit?Math.max(0,t):limit;
 }
 function capsuleEdge(origin,direction,start,end,r,limit){
  edge.copy(end).sub(start);offset.copy(origin).sub(start);const ee=edge.lengthSq();if(ee<EPS)return sphereRoot(origin,direction,start,r,limit);
  const ed=edge.dot(direction),eo=edge.dot(offset),od=offset.dot(direction),oo=offset.lengthSq(),aa=ee-ed*ed,bb=ee*od-eo*ed,cc=ee*oo-eo*eo-r*r*ee;
  const disc=bb*bb-aa*cc;if(aa>EPS&&disc>=0){const t=(-bb-Math.sqrt(disc))/aa,y=eo+t*ed;if(t>=-EPS&&t<=limit&&y>=0&&y<=ee)limit=Math.max(0,t);}
  return Math.min(sphereRoot(origin,direction,start,r,limit),sphereRoot(origin,direction,end,r,limit));
 }
 function hitTriangle(origin,direction,limit,r){
  triangle.set(a,b,c);triangle.closestPointToPoint(origin,closest);const initial=origin.distanceToSquared(closest);
  if(initial<=r*r+EPS){
   // Pre-existing overlap can move tangentially or away, never farther inward.
   // Distance to a convex triangle is convex along a straight segment, so its
   // nonnegative initial derivative guarantees no later deeper penetration.
   probe.copy(origin).addScaledVector(direction,Math.min(.0001,limit));triangle.closestPointToPoint(probe,closest);
   return probe.distanceToSquared(closest)>=initial-1e-10?limit:0;
  }
  triangle.getNormal(normal);const signed=normal.dot(offset.copy(origin).sub(a)),speed=normal.dot(direction);
  if(Math.abs(speed)>EPS)for(const sign of [-1,1]){const t=(sign*r-signed)/speed;if(t>=-EPS&&t<=limit){contact.copy(origin).addScaledVector(direction,Math.max(0,t)).addScaledVector(normal,-sign*r);if(triangle.containsPoint(contact))limit=Math.max(0,t);}}
  limit=capsuleEdge(origin,direction,a,b,r,limit);limit=capsuleEdge(origin,direction,b,c,r,limit);return capsuleEdge(origin,direction,c,a,r,limit);
 }
 function stopDistance(from,to,clearance=radius){
  refresh();stats.queries++;const travel=from.distanceTo(to);if(travel<1e-7)return travel;
  const direction=to.clone().sub(from).divideScalar(travel);let nearest=travel;
  worldSweep.makeEmpty().expandByPoint(from).expandByPoint(to).expandByScalar(clearance);
  for(const entry of entries){
   if(!visible(entry.mesh))continue;
   if(!entry.matrix.equals(entry.mesh.matrixWorld)){entry.matrix.copy(entry.mesh.matrixWorld);entry.box.copy(entry.tree.root.box).applyMatrix4(entry.matrix);}
   if(!worldSweep.intersectsBox(entry.box)||!segmentMeetsBox(from,to,entry.box,clearance))continue;
   inverse.copy(entry.matrix).invert();localFrom.copy(from).applyMatrix4(inverse);localTo.copy(to).applyMatrix4(inverse);const im=inverse.elements;localRadius.set(Math.hypot(im[0],im[4],im[8]),Math.hypot(im[1],im[5],im[9]),Math.hypot(im[2],im[6],im[10])).multiplyScalar(clearance);
   const {tree,mesh}=entry,stack=[tree.root];
   while(stack.length){const node=stack.pop();stats.bvhNodes++;if(!segmentMeetsBox(localFrom,localTo,node.box,localRadius))continue;if(node.left){stack.push(node.left,node.right);continue;}
    for(let i=node.start;i<node.end;i++){
     const ti=tree.ids[i]*3;[a,b,c].forEach((v,j)=>v.fromBufferAttribute(tree.position,tree.index?tree.index.getX(ti+j):ti+j).applyMatrix4(mesh.matrixWorld));stats.narrowTriangles++;
     nearest=hitTriangle(from,direction,nearest,clearance);if(nearest<=EPS)return 0;
    }
   }
  }
  // A small separation avoids accumulating numeric contact jitter.
  return nearest<travel?Math.max(0,nearest-SKIN):travel;
 }
 function move(from,to){const end=constrainCameraPosition(to),travel=from.distanceTo(end);return travel<1e-7?end:from.clone().lerp(end,Math.min(1,stopDistance(from,end)/travel));}
 function route(from,to){
  const end=constrainCameraPosition(to),direct=[from.clone(),end],clear=(a,b)=>stopDistance(a,b)>=a.distanceTo(b)-1e-5;
  function outcome(points,reachedTarget){points.reachedTarget=reachedTarget;points.requestedTarget=end.clone();return points;}
  if(clear(...direct))return outcome(direct,true);
  for(const z of [1.35,2.15,3.4,4.25]){const points=[from.clone(),constrainCameraPosition(new Vector3(from.x,Math.max(.42,from.y),Math.max(from.z,z))),constrainCameraPosition(new Vector3(end.x,Math.max(.42,end.y),Math.max(end.z,z))),end];if(points.slice(1).every((p,i)=>clear(points[i],p)))return outcome(points,true);}
  return outcome([from.clone(),move(from,end)],false);
 }
 return {move,route,stopDistance,invalidate(){invalid=true;},get stats(){return {...stats};}};
}

export function pointOnCameraRoute(points,t){
 const lengths=points.slice(1).map((p,i)=>p.distanceTo(points[i])),total=lengths.reduce((a,b)=>a+b,0);let distance=Math.max(0,Math.min(1,t))*total;
 for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1)return points[i].clone().lerp(points[i+1],lengths[i]>1e-8?distance/lengths[i]:1);distance-=lengths[i];}return points.at(-1).clone();
}
