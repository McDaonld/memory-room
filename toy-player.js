import {captureInspectionPose,turnInspectionObject} from './inspection-turntable.js?v=20261007-overnight1';

/** Isolated collectibles motion. No background audio, recordings or scene ownership. */
export const SYNTHETIC_SOUND_LABEL = '合成机械提示音';

export function createToyPlayer({THREE,assets,onChange=()=>{}}={}) {
  if(!THREE?.Vector3)throw new TypeError('createToyPlayer requires THREE');
  const roots=Array.isArray(assets)?assets:assets?.isObject3D?[assets]:Object.values(assets||{}).filter(x=>x?.isObject3D||x?.scene);
  function find(name){if(assets?.[name]?.isObject3D)return assets[name];for(const item of roots){if(!item)continue;const r=item.scene||item;const found=r.name===name?r:r.getObjectByName?.(name);if(found)return found;}return null;}
  const pivot=find('McDonaldsToyRotationPivot'),knife=find('CSGOBalisongDisplay'),cup=find('NayukiSteelCup');
  const left=find('BalisongHandleLeftPivot'),right=find('BalisongHandleRightPivot'),lid=find('NayukiCupLid');
  const copy=o=>o?{position:o.position.clone(),quaternion:o.quaternion.clone()}:null;
  const rest=new Map([pivot,knife,cup,left,right,lid].filter(Boolean).map(o=>[o,copy(o)]));
  const state={knife:'stored',cup:'stored',toy:'idle'},jobs=new Map();let audio=null,disposed=false;
  const nativeClips=new Map();for(const item of roots)(item.scene||item).traverse?.(o=>{for(const clip of o.animations||[])if(clip.name.startsWith('CS2_'))nativeClips.set(clip.name,clip);});
  const nativeKnife=Boolean(knife?.userData.nativeCS2Animation&&nativeClips.has('CS2_Draw')&&nativeClips.has('CS2_Inspect01'));
  const knifeMixer=nativeKnife?new THREE.AnimationMixer(knife):null;
  function updateKnifeBounds(){knife.parent?.updateWorldMatrix(true,false);knife.updateMatrixWorld(true);knife.traverse(o=>{if(o.isSkinnedMesh){o.computeBoundingBox();o.boundingSphere??=new THREE.Sphere();o.boundingBox.getBoundingSphere(o.boundingSphere);}});}
  function clipPose(name,time){const clip=nativeClips.get(name);knifeMixer.stopAllAction();const action=knifeMixer.clipAction(clip);action.reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();action.paused=true;action.time=time;knifeMixer.update(0);updateKnifeBounds();return action;}
  function clipStage(name,reverse=false){const clip=nativeClips.get(name);return {duration:clip.duration,tracks:[],nativeAction:clipPose(name,reverse?clip.duration:0),reverse};}
  const V=a=>new THREE.Vector3(...a),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
  const ease=t=>t*t*(3-2*t);
  function changed(reason,extra={}){if(!disposed)onChange({reason,...extra,state:{...state}});}
  function worldPosition(o,position){const p=position.isVector3?position.clone():V(position);o.parent?.updateWorldMatrix(true,false);return o.parent?o.parent.worldToLocal(p):p;}
  function worldQuaternion(o,q=[0,0,0,1]){const target=new THREE.Quaternion(...q);if(!o.parent)return target;return o.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(target);}
  function stage(duration,tracks){return {duration,tracks};}
  function move(o,position,quaternion=null){const from=copy(o);return {o,from,to:{position:position?.clone()||from.position.clone(),quaternion:quaternion?.clone()||from.quaternion.clone()}};}
  function qz(angle){return new THREE.Quaternion().setFromAxisAngle(Z,angle);}
  // Queue builders defer from-pose snapshots until the previous stage has finished.
  function job(key,stages,done){jobs.set(key,{stages,index:0,elapsed:0,current:null,done});}
  function localDestination(o,world){return worldPosition(o,world);}
  function audioClick(){
    const AC=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!AC)return false;
    try {
      audio??=new AC();if(audio.state==='suspended')void audio.resume().catch(()=>{});
      const now=audio.currentTime,master=audio.createGain();master.gain.value=.05;master.connect(audio.destination);
      const noise=audio.createBuffer(1,Math.ceil(audio.sampleRate*.075),audio.sampleRate),samples=noise.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/samples.length,3);
      const src=audio.createBufferSource();src.buffer=noise;const filter=audio.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1250;filter.Q.value=.8;src.connect(filter);filter.connect(master);src.start(now);src.stop(now+.075);
      const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.setValueAtTime(180,now);osc.frequency.exponentialRampToValueAtTime(85,now+.27);gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(.18,now+.025);gain.gain.exponentialRampToValueAtTime(.001,now+.32);osc.connect(gain);gain.connect(master);osc.start(now);osc.stop(now+.33);osc.onended=()=>{osc.disconnect();gain.disconnect();src.disconnect();filter.disconnect();master.disconnect();};return true;
    }catch{return false;}
  }
  function playToy({sound=true}={}){
    if(disposed)return {ok:false,reason:'disposed'};
    if(!pivot)return {ok:false,reason:'missing-toy-pivot'};
    if(jobs.has('toy'))return {ok:false,reason:'busy'};
    const base=rest.get(pivot).quaternion.clone();state.toy='turning';
    // A full turn is evaluated as an angle, not a quaternion endpoint (2PI equals 0).
    jobs.set('toy',{spin:true,time:0,duration:2.4,base});
    const soundPlayed=!!sound&&audioClick();changed('toy-start',{soundPlayed,soundLabel:SYNTHETIC_SOUND_LABEL,motion:'whole-toy'});
    return {ok:true,soundPlayed,soundLabel:SYNTHETIC_SOUND_LABEL};
  }
  function idName(id){if(['knife','CSGOBalisongDisplay','CSGoBox'].includes(id))return 'knife';if(['cup','NayukiSteelCup','NayukiFantasyBox'].includes(id))return 'cup';return id;}
  const configs={
    knife:{object:knife,container:'CSGoBox',up:[nativeKnife?.674:.555,3.04,-.328],front:[nativeKnife?.674:.555,3.04,.15],display:[.47,3.26,.15]},
    cup:{object:cup,container:'NayukiFantasyBox',up:[.990,3.245,-.321],front:[.990,3.245,.12],display:[.97,3.30,.12]},
  };
  // Contents remain independent GLB roots. Track the carton in world space so
  // inspector translations also work when carton and contents have different parents.
  function objectWorldPosition(o){o.updateWorldMatrix(true,false);return o.getWorldPosition(new THREE.Vector3());}
  for(const cfg of Object.values(configs)){
    cfg.containerObject=find(cfg.container);
    cfg.containerInitialWorld=cfg.containerObject?objectWorldPosition(cfg.containerObject):new THREE.Vector3();
    cfg.itemInitialWorld=cfg.object?objectWorldPosition(cfg.object):null;
    cfg.showRest=null;cfg.turnPose=null;
  }
  function containerOffset(cfg){return cfg.containerObject?objectWorldPosition(cfg.containerObject).sub(cfg.containerInitialWorld):new THREE.Vector3();}
  function followStored(id){
    const cfg=configs[id],o=cfg.object;if(!o||state[id]!=='stored')return false;
    const target=worldPosition(o,cfg.itemInitialWorld.clone().add(containerOffset(cfg)));
    if(o.position.distanceToSquared(target)<1e-16)return false;
    o.position.copy(target);return true;
  }
  function followAllStored(){let moved=false;for(const id of Object.keys(configs))moved=followStored(id)||moved;return moved;}
  function containerDestination(cfg,world){return worldPosition(cfg.object,V(world).add(containerOffset(cfg)));}
  function show(id,{containerOpen=false}={}){
    id=idName(id);const cfg=configs[id],o=cfg?.object;
    if(disposed||!o)return {ok:false,reason:disposed?'disposed':'missing-object'};
    if(state[id]==='displayed')return {ok:true,reason:'already-displayed'};
    if(jobs.has(id))return {ok:false,reason:'busy'};
    if(!containerOpen){changed('container-required',{container:cfg.container,item:id});return {ok:false,reason:'container-closed',container:cfg.container};}
    followStored(id); // show may be called before the next animation-frame update
    cfg.showRest=copy(o);cfg.turnPose=null;
    const stages=[
      ()=>stage(.65,[move(o,containerDestination(cfg,cfg.up),cfg.showRest.quaternion)]),
      ()=>stage(.62,[move(o,containerDestination(cfg,cfg.front),cfg.showRest.quaternion)]),
      ()=>stage(.65,[move(o,containerDestination(cfg,cfg.display),worldQuaternion(o,id==='knife'&&nativeKnife?(knife.userData.displayRootQuaternion||[0,Math.SQRT1_2,0,Math.SQRT1_2]):[0,0,0,1]))]),
    ];
    if(id==='knife'&&!nativeKnife&&left&&right)stages.push(()=>stage(.55,[move(left,null,qz(-.12)),move(right,null,qz(.12))]));
    if(id==='cup'&&lid)stages.push(()=>stage(.45,[move(lid,rest.get(lid).position.clone().add(V([.12,.07,-.03])))]));
    state[id]='extracting';job(id,stages,()=>{cfg.turnPose=captureInspectionPose(o);state[id]=id==='knife'&&nativeKnife?'ready':'displayed';changed(state[id]==='ready'?'inspection-ready':'displayed',{item:id});});changed('extracting',{item:id});return {ok:true};
  }
  function inspectKnife({draw=false}={}){
    if(disposed||!nativeKnife)return {ok:false,reason:'no-native-animation'};
    if(jobs.has('knife')||!['ready','displayed'].includes(state.knife))return {ok:false,reason:'busy'};
    const cfg=configs.knife,stages=[];
    if(cfg.turnPose&&knife.quaternion.angleTo(cfg.turnPose.quaternion)>1e-7)stages.push(()=>stage(.4,[move(knife,null,cfg.turnPose.quaternion)]));
    if(draw)stages.push(()=>clipStage('CS2_Draw'));
    stages.push(()=>clipStage('CS2_Inspect01'));
    state.knife='inspecting';job('knife',stages,()=>{cfg.turnPose=captureInspectionPose(knife,{preserveZoomBaseline:!draw});state.knife='displayed';changed('inspection-finished',{item:'knife'});});changed('inspection-start',{item:'knife'});return {ok:true};
  }
  function hide(id){
    id=idName(id);const cfg=configs[id],o=cfg?.object;
    if(disposed||!o)return {ok:false,reason:disposed?'disposed':'missing-object'};
    if(state[id]==='stored')return {ok:true,reason:'already-stored'};
    if(jobs.has(id))return {ok:false,reason:'busy'};
    const returnPose=cfg.showRest||rest.get(o);
    const stages=[];
    // Undo the user's inspection turn before folding the handles or lowering the
    // cup lid. Those local motions must start in the extracted, upright pose.
    if(cfg.turnPose&&(o.position.distanceToSquared(cfg.turnPose.position)>1e-16||o.quaternion.angleTo(cfg.turnPose.quaternion)>1e-7))stages.push(()=>stage(.45,[move(o,cfg.turnPose.position,cfg.turnPose.quaternion)]));
    if(id==='knife'&&nativeKnife)stages.push(()=>clipStage('CS2_Draw',true));
    else if(id==='knife'&&left&&right)stages.push(()=>stage(.55,[move(left,rest.get(left).position,rest.get(left).quaternion),move(right,rest.get(right).position,rest.get(right).quaternion)]));
    if(id==='cup'&&lid)stages.push(()=>stage(.45,[move(lid,rest.get(lid).position,rest.get(lid).quaternion)]));
    stages.push(()=>stage(.5,[move(o,null,returnPose.quaternion)]),()=>stage(.65,[move(o,containerDestination(cfg,cfg.front))]),()=>stage(.62,[move(o,containerDestination(cfg,cfg.up))]),()=>stage(.65,[move(o,returnPose.position,returnPose.quaternion)]));
    state[id]='returning';job(id,stages,()=>{cfg.turnPose=null;cfg.showRest=null;state[id]='stored';followStored(id);changed('stored',{item:id,mayCloseContainer:cfg.container});});changed('returning',{item:id});return {ok:true};
  }
  function rotate(id,yaw,pitch=0){id=idName(id);const cfg=configs[id],o=cfg?.object;if(disposed||!o||state[id]!=='displayed'||!Number.isFinite(yaw)||!Number.isFinite(pitch))return false;cfg.turnPose??=captureInspectionPose(o);turnInspectionObject(o,cfg.turnPose,yaw,pitch);changed('inspection-rotate',{item:id});return true;}
  function trigger(id,options={}){if(['mcdonalds','toy','head','body','McDonaldsDoraemonRoot','McDonaldsToyRotationPivot'].includes(id))return playToy(options);const key=idName(id);return state[key]==='displayed'?hide(key):show(key,options);}
  function update(delta=0){
    if(disposed)return;let didChange=followAllStored();
    for(const [key,j] of jobs){
      let remaining=Math.max(0,Number.isFinite(delta)?delta:0);
      if(j.spin){j.time=Math.min(j.duration,j.time+remaining);const a=Math.PI*2*ease(j.time/j.duration);pivot.quaternion.copy(j.base).multiply(new THREE.Quaternion().setFromAxisAngle(Y,a));if(j.time>=j.duration){pivot.quaternion.copy(j.base);jobs.delete(key);state.toy='idle';changed('toy-stop');}didChange=true;continue;}
      while(remaining>0&&j.index<j.stages.length){
        j.current??=j.stages[j.index]();const s=j.current,take=Math.min(remaining,s.duration-j.elapsed);j.elapsed+=take;remaining-=take;
        const t=ease(Math.min(1,j.elapsed/s.duration));for(const tr of s.tracks){tr.o.position.lerpVectors(tr.from.position,tr.to.position,t);tr.o.quaternion.slerpQuaternions(tr.from.quaternion,tr.to.quaternion,t);}if(s.nativeAction){s.nativeAction.time=s.reverse?s.duration-j.elapsed:j.elapsed;knifeMixer.update(0);updateKnifeBounds();}didChange=true;
        if(j.elapsed>=s.duration-1e-8){j.index++;j.elapsed=0;j.current=null;}else break;
      }
      if(j.index>=j.stages.length){jobs.delete(key);j.done?.();}
    }
    if(didChange)changed('frame');
  }
  function reset(){jobs.clear();for(const [o,s] of rest){o.position.copy(s.position);o.quaternion.copy(s.quaternion);}if(nativeKnife)clipPose('CS2_Draw',0);for(const cfg of Object.values(configs)){cfg.turnPose=null;cfg.showRest=null;}state.knife='stored';state.cup='stored';state.toy='idle';followAllStored();changed('reset');}
  function getActions(){return [pivot&&{id:'mcdonalds',label:'转动玩具',description:SYNTHETIC_SOUND_LABEL},knife&&{id:'knife',label:state.knife==='displayed'?'放回机械玩具':'取出机械玩具',container:'CSGoBox'},cup&&{id:'cup',label:state.cup==='displayed'?'放回不锈钢杯':'取出不锈钢杯',container:'NayukiFantasyBox'}].filter(Boolean);}
  function dispose(){if(disposed)return;reset();disposed=true;if(audio){void audio.close().catch(()=>{});audio=null;}}
  return {supportsInspection:nativeKnife,playToy,trigger,show,hide,inspectKnife,rotate,update,reset,dispose,getActions,getObject:id=>configs[idName(id)]?.object||null,getState:()=>({...state}),soundLabel:SYNTHETIC_SOUND_LABEL};
}
