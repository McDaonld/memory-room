import {Vector3} from './vendor/three.module.js';
import {constrainCameraPosition} from './view-navigation.js?v=20261007-overnight1';
import {pointOnCameraRoute} from './camera-clearance.js?v=20261007-overnight1';

// Camera motion uses the room's real sphere/triangle clearance solver.
// No image of a room, timer-driven loading percentage, own RAF or page navigation.
export const ENTRANCE_START=Object.freeze([.85,2.34,4.44]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const vector=v=>v?.isVector3?v.clone():new Vector3(...v);
const homeCopy=home=>({...home,position:vector(home.position),look:vector(home.look)});
const ease=t=>t*t*(3-2*t);

export function planEntranceRoute(home,clearance,{start=ENTRANCE_START}={}){
 const destination=homeCopy(home),from=constrainCameraPosition(vector(start));
 const end=constrainCameraPosition(destination.position);
 // An altered/clamped home would no longer match the viewport policy.
 if(end.distanceTo(destination.position)>1e-8)return {safe:false,reason:'home-outside-room',home:destination};
 const route=clearance.route(from,end);
 const safe=route.reachedTarget===true&&route.length>=2&&route.at(-1).distanceTo(end)<1e-7&&route.slice(1).every((p,i)=>{
  const length=p.distanceTo(route[i]);
  return clearance.stopDistance(route[i],p)>=length-1e-5&&clearance.stopDistance(p,route[i])>=length-1e-5;
 });
 return {safe,reason:safe?'clearance-route':'blocked-route',route,home:destination,start:from};
}

export function createEntranceSequence({
 overlay,host,errorPanel,clearance,getHome,applyView,onLockChange=()=>{},onComplete=()=>{},
 reducedMotion=false,duration=3.5,blockedElements=[],eventTarget=globalThis.window,
 storage=undefined,storageKey='memory-room:entrance-seen:v1',MutationObserverClass=globalThis.MutationObserver,
}={}){
 if(!overlay||!host||!clearance||!getHome||!applyView)throw new TypeError('Entrance requires overlay, host, clearance, getHome and applyView');
 const status=overlay.querySelector('[data-entrance-status]'),skipButton=overlay.querySelector('[data-entrance-skip]');
 let state='loading',phase='models',loaded=0,total=0,prepared=false,readyFlag=false,skipRequested=overlay.dataset.skipRequested==='true';
 let preparedPlan=null,preparedReason=null;
 let elapsed=0,fadeElapsed=0,route=null,startLook=null,home=null,lastView=null,finishReason=null;
 let remaining=Math.max(.1,duration),seen=false,ownStorage=storage,observer=null;
 const previousFocus=overlay.ownerDocument?.activeElement;
 const locked=[...new Set([host,...blockedElements].filter(Boolean))].map(element=>({element,inert:element.inert,aria:element.getAttribute('aria-busy')}));
 try{if(ownStorage===undefined)ownStorage=globalThis.sessionStorage;seen=ownStorage?.getItem(storageKey)==='1';}catch{ownStorage=null;}
 const blocking=()=>state!=='done'&&state!=='disposed';
 const failedPanel=()=>errorPanel&&!errorPanel.hidden&&Boolean(errorPanel.textContent?.trim());
 function lock(value){for(const {element,inert,aria} of locked){element.inert=value?true:inert;if(value)element.setAttribute('aria-busy','true');else if(aria===null)element.removeAttribute('aria-busy');else element.setAttribute('aria-busy',aria);}onLockChange(value);}
 function text(value){if(status&&status.textContent!==value)status.textContent=value;}
 function view(position,look,fov){lastView={position:position.clone(),look:look.clone(),fov};applyView(lastView);}
 function syncHome(){
  home=homeCopy(getHome());
  if(!lastView||!lastView.position.equals(home.position)||!lastView.look.equals(home.look)||lastView.fov!==home.fov)view(home.position,home.look,home.fov);
 }
 function fail(){
  if(state==='disposed'||state==='done'||state==='failed')return;
  state='failed';route=null;overlay.dataset.state='failed';overlay.hidden=true;
  // Leave startup-recovery's message and retry button intact and clickable.
  // Room objects remain locked because there is no usable room yet.
 }
 function progress({phase:nextPhase=phase,loaded:count,total:countTotal}={}){
  if(state!=='loading')return;
  phase=nextPhase;
  if(Number.isInteger(countTotal)&&countTotal>0)total=countTotal;
  if(Number.isInteger(count)&&count>=0)loaded=total?clamp(count,0,total):count;
  const label=phase==='models'?(total?`载入物件 ${loaded} / ${total}`:'正在准备房间'):phase==='layout'?'整理书页与纪念物':phase==='shaders'?'准备光影':phase==='first-frame'?'绘制房间':'正在准备房间';
  text(label);
 }
 function complete(reason){
  if(!readyFlag||state==='done'||state==='failed'||state==='disposed'||state==='finishing')return;
  syncHome();
  route=null;state='finishing';finishReason=reason;fadeElapsed=0;
  overlay.dataset.state='finishing';text('');
 }
 function prepare(refresh=false){
  if(readyFlag||state==='done'||state==='disposed'||prepared&&!refresh)return false;
  // Set the real camera while the loading cover is still opaque, BEFORE the
  // first successful composer frame. ready() must never move that camera.
  home=homeCopy(getHome());
  preparedReason=skipRequested?'skip':reducedMotion?'reduced-motion':seen?'repeat':null;
  preparedPlan=preparedReason?null:planEntranceRoute(home,clearance);
  if(preparedPlan&&!preparedPlan.safe)preparedReason=preparedPlan.reason;
  if(preparedReason)syncHome();else view(preparedPlan.start,home.look,home.fov);
  prepared=true;state='prepared';return true;
 }
 function ready(){
  if(!prepared||readyFlag||!['prepared','failed'].includes(state))return false;
  if(failedPanel()){fail();return false;}
  // startup-recovery can clear its own conservative generic error on room-ready.
  // A genuine successful frame may then proceed, while a specific error cannot.
  state='loading';overlay.hidden=false;overlay.dataset.state='loading';
  // Call only after the genuine first composer frame succeeds.
  readyFlag=true;text('');
  if(preparedReason){complete(preparedReason);return true;}
  route=preparedPlan.route;elapsed=0;remaining=duration;startLook=home.look.clone();
  state='entering';overlay.dataset.state='entering';
  if(skipButton&&(previousFocus===overlay.ownerDocument?.body||!previousFocus))skipButton.focus?.({preventScroll:true});
  return true;
 }
 function skip(){
  if(!blocking()||state==='failed')return;
  if(!readyFlag){skipRequested=true;if(prepared)prepare(true);if(skipButton){skipButton.textContent='准备好后直接进入';skipButton.disabled=true;}return;}
  complete('skip');
 }
 function update(delta=0){
  if(state==='done'||state==='failed'||state==='disposed'||state==='loading'||state==='prepared')return false;
  if(failedPanel()){fail();return false;}
  const dt=Number.isFinite(delta)?clamp(delta,0,.15):0;
  if(state==='entering'){
   elapsed=Math.min(remaining,elapsed+dt);const t=ease(elapsed/remaining);
   view(pointOnCameraRoute(route,t),startLook.clone().lerp(home.look,t),home.fov);
   if(elapsed>=remaining)complete('played');return true;
  }
  fadeElapsed+=dt;
  if(fadeElapsed>=(reducedMotion?.01:.20)){
   // Finalize policy only at unlock, after every finishing-phase resize.
   syncHome();onComplete(homeCopy(home),{reason:finishReason});
   state='done';overlay.hidden=true;overlay.dataset.state='done';lock(false);
   try{ownStorage?.setItem(storageKey,'1');}catch{}
   detach();
   if(overlay.contains(overlay.ownerDocument?.activeElement)&&previousFocus?.isConnected)previousFocus.focus?.({preventScroll:true});
  }
  return true;
 }
 function resize(){
  if(state==='prepared'){prepare(true);return;}
  if(state==='finishing'){syncHome();return;}
  if(state!=='entering')return;
  const next=homeCopy(getHome()),plan=planEntranceRoute(next,clearance,{start:lastView.position});
  if(!plan.safe){complete('resize-safe-fallback');return;}
  remaining=Math.max(.3,remaining-elapsed);elapsed=0;home=next;route=plan.route;startLook=lastView.look.clone();
 }
 function gate(event){
  if(!blocking())return;
  const target=event.target;
  // Recovery UI is deliberately outside the input lock.
  if(errorPanel?.contains(target))return;
  if(event.type==='keydown'&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();skip();return;}
  if(overlay.contains(target))return;
  if(event.type==='keydown'){
   if(event.ctrlKey||event.metaKey||event.altKey||event.key==='Tab')return;
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  if(locked.some(({element})=>element===target||element.contains(target))){event.preventDefault();event.stopImmediatePropagation();}
 }
 const gatedEvents=['pointerdown','pointerup','pointermove','click','dblclick','wheel','touchstart','touchmove','keydown'];
 const skipHandler=event=>{event.preventDefault();event.stopPropagation();skip();};
 function detach(){for(const type of gatedEvents)eventTarget?.removeEventListener(type,gate,true);skipButton?.removeEventListener('click',skipHandler);observer?.disconnect();}
 function dispose(){if(state==='disposed')return;state='disposed';detach();lock(false);}
 for(const type of gatedEvents)eventTarget?.addEventListener(type,gate,{capture:true,passive:false});
 skipButton?.addEventListener('click',skipHandler);
 if(MutationObserverClass&&errorPanel){observer=new MutationObserverClass(()=>{if(failedPanel())fail();});observer.observe(errorPanel,{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true,characterData:true});}
 overlay.dataset.state='loading';lock(true);progress();
 return {progress,prepare,ready,skip,update,resize,fail,dispose,get blocking(){return blocking();},getState:()=>({state,phase,loaded,total,prepared,ready:readyFlag,skipRequested,seen,elapsed,remaining,reason:finishReason})};
}
