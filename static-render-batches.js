// Batch static meshes only while rendering; picking keeps original objects.
// Integration: construct AFTER all replacements/detail/print setup. Use
// batches.render(() => composer.render(dt), {excludeRoots: activeInspectRoots});
// Original nodes remain intact and pickable outside the synchronous render.
import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

const identity=new THREE.Matrix4();
const defaultBefore=THREE.Mesh.prototype.onBeforeRender;
const defaultAfter=THREE.Mesh.prototype.onAfterRender;
const defaultShadowBefore=THREE.Mesh.prototype.onBeforeShadow;
const defaultShadowAfter=THREE.Mesh.prototype.onAfterShadow;
const defaultMaterialCompile=THREE.Material.prototype.onBeforeCompile;
function inTree(o,root){for(let p=o;p;p=p.parent)if(p===root)return true;return false;}
function worldVisible(o){for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;}
function attrSignature(g){
 return Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([k,a])=>[k,a.itemSize,a.normalized,a.array.constructor.name,a.gpuType??'',Boolean(a.isInterleavedBufferAttribute)].join(':')).join('|');
}
function geometryStamp(g){return {index:g.index,indexArray:g.index?.array,indexVersion:g.index?.version,attributes:Object.entries(g.attributes).map(([name,a])=>({name,ref:a,version:a.version,count:a.count,itemSize:a.itemSize,normalized:a.normalized,array:a.array}))};}
function geometryMatches(g,s){if(g.index!==s.index||g.index?.array!==s.indexArray||g.index?.version!==s.indexVersion)return false;let count=0;for(const name in g.attributes)count++;if(count!==s.attributes.length)return false;for(const a of s.attributes){const b=g.attributes[a.name];if(b!==a.ref||b.version!==a.version||b.count!==a.count||b.itemSize!==a.itemSize||b.normalized!==a.normalized||b.array!==a.array)return false;}return true;}
function reason(mesh,options){
 if(!mesh.isMesh)return 'notMesh';
 if(mesh.userData.staticRenderBatch)return 'batchProxy';
 if(mesh.isSkinnedMesh||mesh.isInstancedMesh||mesh.isBatchedMesh)return 'skinnedOrInstanced';
 if(Object.keys(mesh.geometry.morphAttributes).length||mesh.morphTargetInfluences)return 'morph';
 if(Array.isArray(mesh.material))return 'materialArray';
 const m=mesh.material,g=mesh.geometry;
 if(!m||!m.visible)return 'materialHidden';
 if(m.transparent||(m.transmission||0)>0||m.opacity<1)return 'transparentOrTransmission';
 if(mesh.userData.cabinetHitProxy||mesh.userData.noStaticBatch)return 'explicitlyExcluded';
 if(mesh.customDepthMaterial||mesh.customDistanceMaterial)return 'customShadow';
 if(mesh.onBeforeRender!==defaultBefore||mesh.onAfterRender!==defaultAfter||mesh.onBeforeShadow!==defaultShadowBefore||mesh.onAfterShadow!==defaultShadowAfter)return 'renderCallback';
 if(m.onBeforeCompile!==defaultMaterialCompile)return 'customShaderHook';
 if(!mesh.parent||!worldVisible(mesh))return 'notVisible';
 if(g.groups.length||g.drawRange.start!==0||Number.isFinite(g.drawRange.count))return 'partialOrGroupedDraw';
 if(!g.attributes.position||Object.values(g.attributes).some(a=>a.isInterleavedBufferAttribute))return 'unsupportedAttribute';
 if(!g.attributes.normal)return 'missingNormal';
 if(mesh.matrix.determinant()<0)return 'mirroredMesh';
 if(mesh.renderOrder!==0)return 'customRenderOrder';
 if(options.excludeRoots?.some(r=>inTree(mesh,r)))return 'excludedRoot';
 return null;
}

export function planStaticRenderBatches(roots,{minimumMeshes=2,excludeRoots=[],maxVerticesPerBatch=2000000}={}){
 const options={excludeRoots},groups=new Map(),skipped={},seen=new Set();let sourceMeshes=0;
 for(const root of roots){root.updateWorldMatrix(true,true);root.traverse(mesh=>{
  if(!mesh.isMesh||seen.has(mesh))return;seen.add(mesh);sourceMeshes++;
  const why=reason(mesh,options);if(why){skipped[why]=(skipped[why]||0)+1;return;}
  const key=[mesh.parent.uuid,mesh.material.uuid,attrSignature(mesh.geometry),!!mesh.geometry.index,mesh.castShadow,mesh.receiveShadow,mesh.layers.mask,mesh.frustumCulled,mesh.material.side].join('~');
  if(!groups.has(key))groups.set(key,{parent:mesh.parent,material:mesh.material,meshes:[],vertices:0,key});
  const group=groups.get(key);group.meshes.push(mesh);group.vertices+=mesh.geometry.attributes.position.count;
 });}
 const batches=[...groups.values()].filter(g=>g.meshes.length>=minimumMeshes&&g.vertices<=maxVerticesPerBatch);
 return {batches,sourceMeshes,skipped,summary:{batchCount:batches.length,sourceMeshCount:batches.reduce((n,g)=>n+g.meshes.length,0),singlePassDrawsSaved:batches.reduce((n,g)=>n+g.meshes.length-1,0),vertices:batches.reduce((n,g)=>n+g.vertices,0)}};
}

export class StaticRenderBatches{
 constructor(roots,options={}){
  this.roots=roots;this.options=options;this.transactions=null;this.records=[];this.plan=planStaticRenderBatches(roots,options);
  const started=performance.now();
  for(const group of this.plan.batches){
   const geometries=group.meshes.map(mesh=>mesh.geometry.clone().applyMatrix4(mesh.matrix));
   const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
   if(!geometry)continue;
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const proxy=new THREE.Mesh(geometry,group.material),first=group.meshes[0];
   proxy.name='__StaticRenderBatch_'+group.parent.name+'_'+this.records.length;
   proxy.castShadow=first.castShadow;proxy.receiveShadow=first.receiveShadow;proxy.layers.mask=first.layers.mask;proxy.frustumCulled=first.frustumCulled;
   proxy.matrixAutoUpdate=false;proxy.matrix.copy(identity);proxy.visible=false;proxy.userData.staticRenderBatch=true;
   // The originals retain their actual Raycaster implementation and face/UV
   // mapping. Never introduce a proxy hit whose identity differs from a source.
   proxy.raycast=()=>{};
   const snapshots=group.meshes.map(mesh=>({mesh,parent:mesh.parent,matrix:mesh.matrix.clone(),geometry:mesh.geometry,stamp:geometryStamp(mesh.geometry),material:mesh.material,castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,layers:mesh.layers.mask,frustumCulled:mesh.frustumCulled}));
   this.records.push({group,proxy,snapshots});
  }
  this.buildMilliseconds=performance.now()-started;
 }
 begin({excludeRoots=[],camera=null,avoidPartialFrustum=false}={}){
  if(this.transactions)throw new Error('StaticRenderBatches: nested render transaction');
  this.transactions=[];let activeBatches=0,drawsSaved=0;
  const frustum=camera&&avoidPartialFrustum?new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)):null;
  for(const record of this.records){
   const {group,proxy,snapshots}=record;
   if(!worldVisible(group.parent)||excludeRoots.some(root=>inTree(group.parent,root)||snapshots.some(s=>inTree(s.mesh,root))))continue;
   // Fall back to original meshes if an animated/mutated child, print material,
   // UV buffer, visibility or shadow policy changed. No stale baked geometry.
   let valid=true;
   for(const s of snapshots){const m=s.mesh;if(m.matrixAutoUpdate)m.updateMatrix();if(reason(m,{excludeRoots:[]})||m.parent!==s.parent||!m.matrix.equals(s.matrix)||m.geometry!==s.geometry||!geometryMatches(m.geometry,s.stamp)||m.material!==s.material||m.castShadow!==s.castShadow||m.receiveShadow!==s.receiveShadow||m.layers.mask!==s.layers||m.frustumCulled!==s.frustumCulled){valid=false;break;}}
   if(valid&&frustum){let inside=0;for(const s of snapshots)if(!s.mesh.frustumCulled||frustum.intersectsObject(s.mesh))inside++;if(inside!==snapshots.length)valid=false;}
   if(!valid)continue;
   group.parent.add(proxy);
   for(const s of snapshots){this.transactions.push([s.mesh,s.mesh.visible]);s.mesh.visible=false;}
   this.transactions.push([proxy,proxy.visible]);proxy.visible=true;activeBatches++;drawsSaved+=snapshots.length-1;
  }
  return {activeBatches,drawsSaved};
 }
 end(){if(!this.transactions)return;for(let i=this.transactions.length-1;i>=0;i--){const [mesh,visible]=this.transactions[i];mesh.visible=visible;if(mesh.userData.staticRenderBatch)mesh.removeFromParent();}this.transactions=null;}
 render(callback,options){const state=this.begin(options);try{const result=callback(state);if(result&&typeof result.then==='function')throw new Error('StaticRenderBatches only supports synchronous render callbacks');return result;}finally{this.end();}}
 dispose(){this.end();for(const r of this.records){r.proxy.removeFromParent();r.proxy.geometry.dispose();}this.records=[];}
}
