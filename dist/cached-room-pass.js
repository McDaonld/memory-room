import { WebGLRenderTarget, HalfFloatType, ShaderMaterial, UniformsUtils, NoBlending, CustomBlending } from './vendor/three.module.js';
import { Pass, FullScreenQuad } from './vendor/Pass.js';
import { CopyShader } from './vendor/CopyShader.js';
import { SSAOPass } from './vendor/SSAOPass.js';

// Preserve the uncomposited beauty/depth buffer while only a laptop screen
// changes. This is not a screenshot background: any camera or geometry change
// invalidates it and renders the full room before the next presentation.
export class CachedRoomPass extends Pass {
  constructor(scene,camera,screenScene) {
    super();this.scene=scene;this.camera=camera;this.screenScene=screenScene;
    this.needsSwap=false;this.dirty=true;this.surfaceOnly=false;this.excluded=[];
    this.target=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:true});
    this.target.samples=4;
    this.material=new ShaderMaterial({uniforms:UniformsUtils.clone(CopyShader.uniforms),vertexShader:CopyShader.vertexShader,fragmentShader:CopyShader.fragmentShader,depthTest:false,depthWrite:false,blending:NoBlending,toneMapped:false});
    this.quad=new FullScreenQuad(this.material);
  }
  invalidate(){this.dirty=true;}
  setSize(w,h){this.target.setSize(w,h);this.invalidate();}
  render(renderer,writeBuffer,readBuffer){
    const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    renderer.setRenderTarget(this.target);
    if(this.dirty||!this.surfaceOnly){
      const visibility=this.excluded.map(o=>o.visible);this.excluded.forEach(o=>o.visible=false);
      try{renderer.autoClear=true;renderer.render(this.scene,this.camera);this.dirty=false;}finally{this.excluded.forEach((o,i)=>o.visible=visibility[i]);}
    }else{
      renderer.autoClear=false;renderer.render(this.screenScene,this.camera);
    }
    renderer.autoClear=false;renderer.setRenderTarget(this.renderToScreen?null:readBuffer);
    this.material.uniforms.tDiffuse.value=this.target.texture;this.quad.render(renderer);
    renderer.autoClear=autoClear;renderer.setRenderTarget(previous);
  }
  dispose(){this.target.dispose();this.material.dispose();this.quad.dispose();}
}

// AO depends on geometry and camera, not on cursor pixels or fresh ink.
export class CachedAmbientOcclusionPass extends SSAOPass {
  constructor(...args){super(...args);this.dirty=true;}
  invalidate(){this.dirty=true;}
  setSize(w,h){super.setSize(Math.max(1,Math.ceil(w*.5)),Math.max(1,Math.ceil(h*.5)));this.invalidate();}
  _overrideVisibility(){
    super._overrideVisibility();
    this.scene.traverse(o=>{if(o.visible&&o.userData.excludeAmbientOcclusion){o.visible=false;this._visibilityCache.push(o);}});
  }
  render(renderer,writeBuffer,readBuffer,dt,mask){
    if(this.dirty){super.render(renderer,writeBuffer,readBuffer,dt,mask);this.dirty=false;return;}
    this.copyMaterial.uniforms.tDiffuse.value=this.blurRenderTarget.texture;
    this.copyMaterial.blending=CustomBlending;
    this._renderPass(renderer,this.copyMaterial,this.renderToScreen?null:readBuffer);
  }
}

// Drawing is physically positioned in front of the camera. Compose its paper
// and moving brush AFTER the static room AO, without stale brush silhouettes.
export class ForegroundPass extends Pass {
 constructor(scene,camera){super();this.scene=scene;this.camera=camera;this.needsSwap=false;this.enabled=false;}
 render(renderer,writeBuffer,readBuffer){
  const previous=renderer.getRenderTarget(),auto=renderer.autoClear;
  renderer.setRenderTarget(this.renderToScreen?null:readBuffer);renderer.autoClear=false;renderer.clearDepth();renderer.render(this.scene,this.camera);
  renderer.autoClear=auto;renderer.setRenderTarget(previous);
 }
}
