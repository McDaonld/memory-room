import * as THREE from './vendor/three.module.js';

// These maps describe microscopic material relief only. Edges, seams, folds and
// silhouettes remain mesh geometry, with no photographic shadows in the base color.
let seed=24731;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function noiseMap(kind){
 const n=512,canvas=document.createElement('canvas');canvas.width=canvas.height=n;
 const context=canvas.getContext('2d'),pixels=context.createImageData(n,n);
 const phase=Array.from({length:n},()=>rnd());
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=(y*n+x)*4,random=rnd()-.5;
  let v;
  if(kind==='wood'||kind==='woodColor'){
   const drift=3*Math.sin(y*.012)+1.4*Math.sin(y*.043+x*.005);
   v=kind==='woodColor'?244+2*Math.sin((x+drift)*.18)+Math.sin((x+drift)*.77)+random:174+12*Math.sin((x+drift)*.18)+5*Math.sin((x+drift)*.77)+5*random+phase[x]*7;
  }else if(kind==='fabric')v=170+8*Math.sin(x*Math.PI/2)*Math.sin(y*Math.PI/2)+random*18;
  else v=177+random*20+4*Math.sin(x*.022)*Math.sin(y*.032);
  pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;
 }
 context.putImageData(pixels,0,0);const map=new THREE.CanvasTexture(canvas);
 map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=8;map.channel=1;
 if(kind==='woodColor')map.colorSpace=THREE.SRGBColorSpace;
 return map;
}
const maps={wood:noiseMap('wood'),woodColor:noiseMap('woodColor'),fabric:noiseMap('fabric'),paint:noiseMap('paint')};
function surfaceUV(mesh,scale=1){
 const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
 if(!p||!n)return;
 const uv=new Float32Array(p.count*2);
 for(let i=0;i<p.count;i++){
  const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  if(ny>=nx&&ny>=nz){uv[i*2]=z*scale;uv[i*2+1]=x*scale;}
  else if(nx>=nz){uv[i*2]=z*scale;uv[i*2+1]=y*scale;}
  else {uv[i*2]=y*scale;uv[i*2+1]=x*scale;}
 }
 g.setAttribute('uv1',new THREE.BufferAttribute(uv,2));
}
export function detailMaterialMesh(mesh,kind,scale=1,{preserveRoughness=false}={}){
 surfaceUV(mesh,scale);
 const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
 const materials=originals.map(material=>{
  if(!material?.normalMap)return material;
  const channel=material.normalMap.channel,attribute=channel===0?'uv':`uv${channel}`;
  if(channel>=0&&mesh.geometry.getAttribute(attribute))return material;
  // The backpack lining export lacks valid source UVs. Repair only its map;
  // the exterior's valid stitched-fabric UV and normal strength stay intact.
  const copy=material.clone();copy.normalMap=material.normalMap.clone();copy.normalMap.channel=1;copy.needsUpdate=true;return copy;
 });
 mesh.material=Array.isArray(mesh.material)?materials:materials[0];
 for(const material of materials){
  if(!material?.isMeshStandardMaterial)continue;
  if(/joint_recess/i.test(material.name))continue;
  if(kind==='wood'&&!material.map)material.map=maps.woodColor;
  if(!material.normalMap&&!material.bumpMap){material.bumpMap=maps[kind];material.bumpScale=kind==='wood'?.00035:kind==='fabric'?.0006:preserveRoughness?.00008:.0003;}
  if(!preserveRoughness){material.roughnessMap=kind==='wood'?maps.wood:null;material.roughness=kind==='wood'?.86:.94;}
  material.needsUpdate=true;
 }
}
export function detailAsset(asset){
 asset.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const names=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.name||'').join(' ').toLowerCase();
  if(/wood|laminate|oak|ash gray/.test(names))detailMaterialMesh(mesh,'wood',3.5,{preserveRoughness:true});
  else if(/fabric|pillow|woven|cloth/.test(names))detailMaterialMesh(mesh,'fabric',14,{preserveRoughness:true});
  else if(/ivory painted|painted mdf/.test(names))detailMaterialMesh(mesh,'paint',8,{preserveRoughness:true});
 });
}
