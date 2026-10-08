import * as THREE from './vendor/three.module.js';
import {createInkSurface} from './ink-surface.js?v=20261007-overnight1';

// The drawing surface stays in world space. Pointer coordinates are supplied by
// the same raycaster as the room, so the ink follows the paper in perspective.
export function createDrawingScroll({scene,camera,renderer,foregroundScene=scene,onChange}){
 const ink=createInkSurface(renderer),{canvas,texture}=ink;
 let root=null,paper=null,last=null,penDown=false,opening=0,color='#20201a',brush=null,brushRest=null,brushTarget=null;
 const bar=document.createElement('div');bar.id='drawing-tools';bar.hidden=true;
 for(const [label,action] of [['墨色',()=>color='#20201a'],['朱砂',()=>color='#9c2e25'],['清纸',()=>clear()],['保存',()=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='书桌上的一幅字.png';a.click();}]]){const b=document.createElement('button');b.textContent=label;b.addEventListener('click',action);bar.append(b);}
 document.body.append(bar);
 function clear(){ink.clear();onChange();}
 clear();
 function open(selectedBrush){
  if(root)return;root=new THREE.Group();root.name='InteractiveDrawingScroll';
  const distance=Math.max(.95,1.08/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  root.position.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()),distance);root.quaternion.copy(camera.quaternion);foregroundScene.add(root);
  paper=new THREE.Mesh(new THREE.PlaneGeometry(1.05,.718),new THREE.MeshStandardMaterial({map:texture,roughness:.95,side:THREE.DoubleSide,emissiveMap:texture,emissive:'#ffffff',emissiveIntensity:.10}));paper.castShadow=false;paper.receiveShadow=false;root.add(paper);
  for(const x of [-.537,.537]){const cylinder=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.775,24),new THREE.MeshStandardMaterial({color:'#514030',roughness:.42}));cylinder.position.x=x;root.add(cylinder);for(const y of [-.404,.404]){const cap=new THREE.Mesh(new THREE.SphereGeometry(.022,16,8),new THREE.MeshStandardMaterial({color:'#34271e',roughness:.35}));cap.position.set(x,y,0);root.add(cap);}}
  root.scale.x=.03;opening=0;bar.hidden=false;
  if(selectedBrush){brush=selectedBrush;brushRest={parent:brush.parent,position:brush.position.clone(),quaternion:brush.quaternion.clone(),scale:brush.scale.clone(),shadows:[]};brush.traverse(o=>{if(o.isMesh){brushRest.shadows.push([o,o.castShadow]);o.castShadow=false;}});brush.userData.excludeAmbientOcclusion=true;foregroundScene.attach(brush);brushTarget=new THREE.Vector3(.34,-.10,.008);}
  onChange({geometry:true});
 }
 function close(){if(!root)return;root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});root.removeFromParent();root=paper=null;bar.hidden=true;last=null;penDown=false;if(brush&&brushRest){brushRest.parent.add(brush);brush.position.copy(brushRest.position);brush.quaternion.copy(brushRest.quaternion);brush.scale.copy(brushRest.scale);for(const [object,casts] of brushRest.shadows)object.castShadow=casts;delete brush.userData.excludeAmbientOcclusion;}brush=brushRest=brushTarget=null;onChange({geometry:true});}
 function pointer(type,uv,pressure=.5,buttons){
  if(!root)return false;
  if(type==='cancel'){last=null;penDown=false;return true;}
  // Primary contact can end via pointermove while a mouse/pen auxiliary button stays held.
  if(type==='move'&&penDown&&Number.isFinite(buttons)&&(buttons&1)===0){last=null;penDown=false;}
  if(!uv){if(type==='move'||type==='up')last=null;if(type==='up')penDown=false;return false;}
  brushTarget?.set((uv.x-.5)*1.05,(uv.y-.5)*.718,.008);
  const p={x:uv.x*2048,y:(1-uv.y)*1400,r:(8+THREE.MathUtils.clamp(pressure||.5,.05,1)*15)/2};
  if(type==='down'){penDown=true;last=p;ink.stroke(p,p,p.r,p.r,color);onChange();}
  else if((type==='move'||type==='up')&&penDown){const from=last||p;ink.stroke(from,p,from.r,p.r,color);last=p;onChange();}
  if(type==='up'){last=null;penDown=false;}
  return true;
 }
 function update(dt){if(root&&opening<1){opening=Math.min(1,opening+dt/1.0);root.scale.x=.03+.97*(1-(1-opening)**3);onChange();}if(root&&brush&&brushTarget){const q=root.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.60,0,-.46))),tip=new THREE.Vector3(...(brush.userData.tipLocal||[0,-.5,0])).applyQuaternion(q),p=root.localToWorld(brushTarget.clone()).sub(tip);if(brush.position.distanceTo(p)>.0001||brush.quaternion.angleTo(q)>.0001){brush.position.copy(p);brush.quaternion.copy(q);onChange();}}}
 function refit(){if(!root)return;const distance=Math.max(.95,1.08/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));root.position.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()),distance);root.quaternion.copy(camera.quaternion);onChange({geometry:true});}
 return {open,close,pointer,update,refit,restoreContext(){last=null;penDown=false;return ink.restoreFromCPU();},flush:()=>{if(root)ink.flush();},get active(){return !!root;},get paper(){return paper;}};
}
