import * as THREE from './vendor/three.module.js';
import {FullScreenQuad} from './vendor/Pass.js';

// Ink stays on a persistent GPU paper texture. A pen event appends small
// capsules; it never uploads the 11 MB paper canvas or re-renders the room.
export function createInkSurface(renderer,width=2048,height=1400){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false,stencilBuffer:false});
 target.texture.colorSpace=THREE.LinearSRGBColorSpace;target.texture.generateMipmaps=false;
 const paperTexture=new THREE.CanvasTexture(canvas);paperTexture.colorSpace=THREE.SRGBColorSpace;paperTexture.generateMipmaps=false;
 const baseMaterial=new THREE.MeshBasicMaterial({map:paperTexture,depthTest:false,depthWrite:false,toneMapped:false});
 const base=new FullScreenQuad(baseMaterial);
 const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{size:{value:new THREE.Vector2(width,height)}},
  vertexShader:`attribute vec4 segment;attribute vec2 radii;attribute vec3 ink;varying vec2 point;varying vec4 ends;varying vec2 rs;varying vec3 color;uniform vec2 size;void main(){point=position.xy;ends=segment;rs=radii;color=ink;gl_Position=vec4(position.x/size.x*2.-1.,1.-position.y/size.y*2.,0.,1.);}`,
  fragmentShader:`varying vec2 point;varying vec4 ends;varying vec2 rs;varying vec3 color;void main(){vec2 d=ends.zw-ends.xy;float t=clamp(dot(point-ends.xy,d)/max(dot(d,d),.001),0.,1.);float dist=length(point-(ends.xy+d*t))-mix(rs.x,rs.y,t);float alpha=1.-smoothstep(-.7,.7,dist);if(alpha<=0.)discard;gl_FragColor=vec4(color,alpha);}`});
 const geometry=new THREE.BufferGeometry(),mesh=new THREE.Mesh(geometry,material),inkScene=new THREE.Scene();mesh.frustumCulled=false;inkScene.add(mesh);
 const camera=new THREE.Camera();let pending=[],reset=true,disposed=false;
 function clear(){
  ctx.fillStyle='#ede5cc';ctx.fillRect(0,0,width,height);let seed=7123;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<25000;i++){ctx.fillStyle=i%2?'#c9b99514':'#fffbee30';ctx.fillRect(rnd()*width,rnd()*height,1+rnd()*3,1);}
  pending=[];reset=true;paperTexture.needsUpdate=true;
 }
 function stroke(from,to,r0,r1,color){
  if(disposed)return;pending.push({from:{...from},to:{...to},r0,r1,color});
  // Normal strokes use GPU capsules; this mirror supports PNG download and context-recovery base refill.
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=r0+r1;
  ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
  ctx.beginPath();ctx.arc(to.x,to.y,r1,0,Math.PI*2);ctx.fill();
 }
 // Render targets lose their pixels on context restoration. The CPU canvas
 // already includes every queued capsule; replaying that queue would double ink.
 function restoreFromCPU(){if(disposed)return false;pending=[];reset=true;paperTexture.needsUpdate=true;return true;}
 function flush(){
  if(disposed||(!reset&&!pending.length))return false;
  const previous=renderer.getRenderTarget(),auto=renderer.autoClear,xr=renderer.xr.enabled;
  renderer.xr.enabled=false;renderer.autoClear=false;renderer.setRenderTarget(target);
  if(reset){base.render(renderer);reset=false;pending=[];}
  if(pending.length){
   const positions=[],segments=[],radii=[],colors=[];
   for(const s of pending){
    const r=Math.max(s.r0,s.r1)+1,a=s.from,b=s.to,c=new THREE.Color(s.color);
    const x0=Math.min(a.x,b.x)-r,x1=Math.max(a.x,b.x)+r,y0=Math.min(a.y,b.y)-r,y1=Math.max(a.y,b.y)+r;
    for(const [x,y]of [[x0,y0],[x0,y1],[x1,y0],[x1,y0],[x0,y1],[x1,y1]]){
     positions.push(x,y,0);segments.push(a.x,a.y,b.x,b.y);radii.push(s.r0,s.r1);colors.push(c.r,c.g,c.b);
    }
   }
   const needed=positions.length/3;
   if(!geometry.getAttribute('position')||geometry.getAttribute('position').count<needed){
    geometry.dispose();const capacity=2**Math.ceil(Math.log2(Math.max(192,needed)));
    for(const [name,size]of [['position',3],['segment',4],['radii',2],['ink',3]])geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(capacity*size),size).setUsage(THREE.DynamicDrawUsage));
   }
   for(const [name,data]of [['position',positions],['segment',segments],['radii',radii],['ink',colors]]){const a=geometry.getAttribute(name);a.array.set(data);a.clearUpdateRanges();a.addUpdateRange(0,data.length);a.needsUpdate=true;}
   geometry.setDrawRange(0,positions.length/3);renderer.render(inkScene,camera);pending=[];
  }
  renderer.setRenderTarget(previous);renderer.autoClear=auto;renderer.xr.enabled=xr;return true;
 }
 clear();
 return {texture:target.texture,canvas,clear,stroke,flush,restoreFromCPU,get pending(){return pending.length;},dispose(){disposed=true;target.dispose();paperTexture.dispose();base.dispose();baseMaterial.dispose();material.dispose();geometry.dispose();}};
}
