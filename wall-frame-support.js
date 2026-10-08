// Virtual-room installation detail: two discreet folded steel mounting tabs.
// The reference does not reveal the real hardware. These stay on the cabinet.
export function addWallFrameSupport(THREE,scene,assets){
 const previous=scene.getObjectByName('WallHouseCabinetMountRoot');if(previous)return {applied:true,root:previous,reused:true};
 const frame=assets.map(a=>a.getObjectByName('RightWallHouseFrameRoot')).find(Boolean);
 if(!frame)return {applied:false,reason:'missing frame'};
 frame.updateWorldMatrix(true,true);
 const origin=frame.getWorldPosition(new THREE.Vector3()),q=frame.getWorldQuaternion(new THREE.Quaternion());
 if(origin.distanceTo(new THREE.Vector3(1.2400000095367432,1.687999963760376,-.19900000095367432))>1e-6
  ||q.angleTo(new THREE.Quaternion(0,-.5299193859100342,0,.8480480313301086))>1e-5
  ||frame.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))>1e-6)return {applied:false,reason:'frame pose changed'};
 const cabinet=assets.map(a=>a.getObjectByName('Furniture_|_wood_edge_band_silver_ash001')).find(Boolean);
 if(!cabinet?.isMesh)return {applied:false,reason:'cabinet mounting face missing'};
 // Startup-only checks at the actual two pad footprints. A matching frame pose
 // alone is insufficient if the cabinet is later moved or its face is rebuilt.
 cabinet.updateWorldMatrix(true,false);const faceRay=new THREE.Raycaster(),normalMatrix=new THREE.Matrix3().getNormalMatrix(cabinet.matrixWorld);
 faceRay.near=0;faceRay.far=.02;
 for(const y of [.076,.112]){
  const target=frame.localToWorld(new THREE.Vector3(-.137,y,-.00812));
  for(const dx of [-.007,0,.007])for(const dy of [-.008,0,.008]){
   faceRay.set(new THREE.Vector3(target.x+dx,target.y+dy,-.34348000858306885),new THREE.Vector3(0,0,-1));
   const hit=faceRay.intersectObject(cabinet,false)[0],n=hit?.face?.normal.clone().applyMatrix3(normalMatrix).normalize();
   if(!hit||Math.abs(hit.point.z+.35350000858306885)>.00005||!n||n.z<.999)return {applied:false,reason:'cabinet mounting face changed'};
  }
 }
 const root=new THREE.Group();root.name='WallHouseCabinetMountRoot';root.userData.virtualInstallation=true;root.userData.fixedTo='cabinet';
 const metal=new THREE.MeshStandardMaterial({name:'Discreet folded steel mount',color:'#687078',roughness:.66,metalness:.45});
 const rubber=new THREE.MeshStandardMaterial({name:'Small mount contact pad',color:'#404541',roughness:.92});
 function mesh(name,vertices,faces,material=metal){const g=new THREE.BufferGeometry(),p=[];for(const f of faces)for(const i of f)p.push(...vertices[i]);g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();g.computeBoundingBox();const o=new THREE.Mesh(g,material);o.name=name;o.castShadow=true;o.receiveShadow=true;root.add(o);return o;}
 const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
 function box(name,lo,hi,material=metal){const v=[];for(const z of [lo[2],hi[2]])for(const [x,y]of [[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]])v.push([x,y,z]);return mesh(name,v,faces,material);}
 function localTab(name,y){const v=[];for(const z of [-.00872,-.00752])for(const [x,dy]of [[-.142,-.006],[-.132,-.006],[-.132,.006],[-.142,.006]])v.push(frame.localToWorld(new THREE.Vector3(x,y+dy,z)).toArray());return mesh(name,v,faces);}
 for(const [i,y]of [[1,.076],[2,.112]]){
  const target=frame.localToWorld(new THREE.Vector3(-.137,y,-.00812)),backZ=-.35348000858306885;
  box('Wall mount '+i+' cabinet contact pad',[target.x-.008,target.y-.009,backZ],[target.x+.008,target.y+.009,backZ+.0004],rubber);
  box('Wall mount '+i+' folded cabinet plate',[target.x-.008,target.y-.009,backZ+.0004],[target.x+.008,target.y+.009,backZ+.0016]);
  localTab('Wall mount '+i+' frame contact tab',y);
  const a=frame.localToWorld(new THREE.Vector3(-.142,y-.0054,-.00812)),b=frame.localToWorld(new THREE.Vector3(-.132,y-.0054,-.00812));
  const v=[];for(const dy of [-.0006,.0006])for(const p of [[a.x,backZ+.0010],[b.x,backZ+.0010],[b.x,b.z],[a.x,a.z]])v.push([p[0],a.y+dy,p[1]]);
  // Horizontal return leg. Vertex layers are Y, hence reversed winding.
  mesh('Wall mount '+i+' short folded return',v,faces.map(f=>[...f].reverse()));
 }
 scene.add(root);root.updateMatrixWorld(true);return {applied:true,root,frame};
}
