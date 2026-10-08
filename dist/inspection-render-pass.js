import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {ForegroundPass} from './cached-room-pass.js?v=20261007-overnight1';

// Inspectable objects are already extracted into a clear volume in front of
// the desk. Bake only their internal, settled parts into material batches;
// preserve the real mesh silhouette and all print pixels. Rotation changes
// one root matrix, not thousands of room draws and shadow/AO passes.
export class InspectionRenderPass extends ForegroundPass{
 constructor(room,camera,lights){
  const scene=new THREE.Scene();scene.environment=room.environment;scene.environmentIntensity=room.environmentIntensity;
  for(const light of lights){const copy=light.clone();copy.castShadow=false;scene.add(copy);if(copy.target){copy.target=light.target.clone();scene.add(copy.target);}}
  super(scene,camera);this.objects=[];this.proxies=[];this.liveMeshes=[];this.oldAO=[];
  this.detailFill=new THREE.DirectionalLight('#e5e8df',.85);this.detailFill.castShadow=false;this.detailFill.visible=false;scene.add(this.detailFill,this.detailFill.target);
 }
 setObjects(objects){
  objects=objects.filter(Boolean);if(objects.length===this.objects.length&&objects.every((o,i)=>o===this.objects[i]))return false;
  for(const [object,value]of this.oldAO){if(value===undefined)delete object.userData.excludeAmbientOcclusion;else object.userData.excludeAmbientOcclusion=value;}
  for(const {root}of this.proxies){root.traverse(m=>{if(m.isMesh)m.geometry.dispose();});root.removeFromParent();}
  for(const {copy}of this.liveMeshes)copy.removeFromParent();this.liveMeshes=[];
  this.objects=objects;this.proxies=[];this.oldAO=[];this.detailFill.visible=objects.some(o=>o.name==='JordanBackpackRoot');
  for(const object of objects){
   object.updateWorldMatrix(true,true);this.oldAO.push([object,object.userData.excludeAmbientOcclusion]);object.userData.excludeAmbientOcclusion=true;
   const root=new THREE.Group();root.matrixAutoUpdate=false;this.scene.add(root);const groups=new Map(),inverse=object.matrixWorld.clone().invert();
   object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(let p=mesh;p&&p!==object.parent;p=p.parent)if(!p.visible)return;
    if(mesh.isSkinnedMesh||Array.isArray(mesh.material)){
     const copy=mesh.clone(false);copy.matrixAutoUpdate=false;copy.frustumCulled=false;copy.castShadow=false;copy.receiveShadow=false;this.scene.add(copy);this.liveMeshes.push({source:mesh,copy,object});return;
    }
    if(mesh.material.opacity===0)return;
    const geometry=mesh.geometry.clone();
    if(mesh.morphTargetInfluences?.some(v=>v!==0)){const p=geometry.getAttribute('position'),v=new THREE.Vector3();for(let i=0;i<p.count;i++){mesh.getVertexPosition(i,v);p.setXYZ(i,v.x,v.y,v.z);}geometry.morphAttributes={};geometry.computeVertexNormals();}
    geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    const flat=geometry.index?geometry.toNonIndexed():geometry;if(flat!==geometry)geometry.dispose();
    const count=flat.getAttribute('position').count;if(!flat.getAttribute('normal'))flat.computeVertexNormals();
    for(const name of ['uv','uv1'])if(!flat.getAttribute(name))flat.setAttribute(name,new THREE.BufferAttribute(new Float32Array(count*2),2));
    for(const name of Object.keys(flat.attributes))if(!['position','normal','uv','uv1'].includes(name))flat.deleteAttribute(name);
    const key=mesh.material.uuid;let group=groups.get(key);if(!group){group={material:mesh.material,geometries:[]};groups.set(key,group);}group.geometries.push(flat);
   });
   for(const {material,geometries}of groups.values()){const combined=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(combined){const mesh=new THREE.Mesh(combined,material);mesh.frustumCulled=false;root.add(mesh);}}
   this.proxies.push({object,root});
  }
  this.enabled=objects.length>0;this.update();return true;
 }
 update(){if(this.detailFill.visible){this.detailFill.position.copy(this.camera.position).add(new THREE.Vector3(-.4,.7,0).applyQuaternion(this.camera.quaternion));this.detailFill.target.position.copy(this.camera.position).add(this.camera.getWorldDirection(new THREE.Vector3()));}for(const {object,root}of this.proxies){object.updateWorldMatrix(true,true);root.matrix.copy(object.matrixWorld);}for(const {source,copy,object}of this.liveMeshes){copy.matrix.copy(source.matrixWorld);copy.visible=true;for(let p=source;p&&p!==object.parent;p=p.parent)if(!p.visible){copy.visible=false;break;}if(source.isSkinnedMesh){copy.bindMatrix.copy(source.bindMatrix);copy.bindMatrixInverse.copy(source.bindMatrixInverse);copy.skeleton=source.skeleton;}copy.morphTargetInfluences=source.morphTargetInfluences;}}
}

// Reading pages bend every frame. Share their live geometry rather than baking
// it into an immutable inspection batch. The room behind the book stays still.
export class ReadingRenderPass extends ForegroundPass{
 constructor(room,camera,lights){const scene=new THREE.Scene();scene.environment=room.environment;scene.environmentIntensity=room.environmentIntensity;
  for(const light of lights){const copy=light.clone();copy.castShadow=false;scene.add(copy);if(copy.target){copy.target=light.target.clone();scene.add(copy.target);}}
  super(scene,camera);this.object=null;this.meshes=[];
 }
 setObject(object){if(object===this.object)return false;
  if(this.object){if(this.oldAO===undefined)delete this.object.userData.excludeAmbientOcclusion;else this.object.userData.excludeAmbientOcclusion=this.oldAO;}
  for(const {copy}of this.meshes)copy.removeFromParent();this.meshes=[];this.object=object;this.enabled=Boolean(object);
  if(object){this.oldAO=object.userData.excludeAmbientOcclusion;object.userData.excludeAmbientOcclusion=true;object.traverse(source=>{if(source.isMesh){const copy=new THREE.Mesh(source.geometry,source.material);copy.matrixAutoUpdate=false;copy.frustumCulled=false;copy.morphTargetInfluences=source.morphTargetInfluences;this.scene.add(copy);this.meshes.push({source,copy});}});}this.update();return true;
 }
 update(){if(!this.object)return;this.object.updateWorldMatrix(true,true);for(const {source,copy}of this.meshes){copy.matrix.copy(source.matrixWorld);copy.visible=true;for(let p=source;p&&p!==this.object.parent;p=p.parent)if(!p.visible){copy.visible=false;break;}}}
}
