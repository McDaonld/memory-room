import {constrainCameraPosition} from './view-navigation.js?v=20261007-overnight1';
import {captureInspectionPose,turnInspectionObject} from './inspection-turntable.js?v=20261007-overnight1';
// Inspect real object roots in the existing room while preserving their scale.
// Optional: flyCamera.getState() => { position, look, aspect, fov } restores the exact
// incoming camera on close. Vectors may be THREE.Vector3 instances or arrays.
export function createObjectInspector({
  THREE, scene, assets, mark, flyCamera, cameraFov = 52, caption = () => {},
  onBusy = () => {}, onChange = () => {}, onPrepare = () => {}, onRestore = () => {}, fixedResize = null,
}) {
  const labels = {
    LuckinCatCup: '猫形纸杯',
    TastienGanganCup: '几何图案纸杯',
    LuckinBigFishCup: '海蓝纸杯',
    SonyHeadphonesBox: '耳机收纳盒',
    NayukiFantasyBox: '金属杯收纳盒',
    TastienBurgerBox: '折叠纸盒',
    CSGoBox: '机械玩具收藏盒',
    BUVCard: '几何艺术卡片',
    IttoArtCard: '色彩艺术卡片',
    WadeUpperBox: '上层收纳盒',
    WadeLowerBox: '下层收纳盒',
    UpperYellowBox: '书摞上的黄色纸盒',
  };
  const cards = new Set(['BUVCard', 'IttoArtCard']);
  const simple = new Set(['BUVCard','IttoArtCard','DeskFigurineRoot','McDonaldsDoraemonRoot']);
  Object.assign(labels,{DeskFigurineRoot:'几何桌面挂件',McDonaldsDoraemonRoot:'旋转桌面玩具'});
  const entries = new Map();
  const marked = new WeakSet();
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = null, tween = null, token = 0, busy = false, pending = null;
  const vector = value => value?.isVector3 ? value.clone() : new THREE.Vector3(...value);
  const ease = t => t * t * (3 - 2 * t);
  const changed = () => { scene.updateMatrixWorld(true); onChange(); };
  function setBusy(value) {
    if (busy !== value) { busy = value; onBusy(value); }
    onChange();
  }
  function roots() {
    const list = Array.isArray(assets) ? assets
      : assets instanceof Map ? [...assets.values()] : Object.values(assets || {});
    return [...list.map(a => a?.scene || a).filter(Boolean), scene];
  }
  function findRoot(name) {
    // Prefer the replacement with an independent lid over an old duplicate.
    const candidates = roots().map(a => a.getObjectByName?.(name)).filter(Boolean);
    return candidates.find(o => simple.has(name) || o.getObjectByName(name + 'Lid')) || null;
  }
  function register(name) {
    const object = findRoot(name);
    if (object && !marked.has(object)) {
      const action = 'collectible:' + name;
      if (object.userData.action !== action) mark?.(object, action);
      marked.add(object);
    }
    return object;
  }
  Object.keys(labels).forEach(register);
  const ready = Promise.all([
    'desk-keepsakes-interactions', 'top-packaging-interactions','branded-cartons-refined-interactions',
  ].map(async name => {
    const response = await fetch(new URL(`./assets/${name}.json`, import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Cannot load ${name}: ${response.status}`);
    return response.json();
  })).then(dataList=>{
   // Later replacement manifests override earlier generic boxes regardless
   // of network completion order.
   for(const data of dataList){
    for (const item of data.items || []) {
      if (!labels[item.root] || cards.has(item.root)) continue;
      if (!item.openingCenter || (!item.openMotion?.delta&&!item.foldAnimation) || !item.lid) continue;
      entries.set(item.root, item); register(item.root);
    }}return true;
  }).catch(error => {
    console.warn('Object inspector manifests unavailable', error);
    return false; // A missing optional manifest never rejects scene startup.
  });

  function actionName(action) {
    return typeof action === 'string' && action.startsWith('collectible:')
      ? action.slice('collectible:'.length) : null;
  }
  function canOpen(action) {
    const name = actionName(action);
    return Boolean(name && labels[name] && register(name));
  }
  function pose(object) {
    return {
      position: object.position.clone(), quaternion: object.quaternion.clone(),
      scale: object.scale.clone(), matrix: object.matrix.clone(),
      matrixAutoUpdate: object.matrixAutoUpdate,
    };
  }
  function restore(object, saved) {
    object.position.copy(saved.position); object.quaternion.copy(saved.quaternion);
    object.scale.copy(saved.scale); object.matrix.copy(saved.matrix);
    object.matrixAutoUpdate = saved.matrixAutoUpdate;
    object.updateMatrixWorld(true);
  }
  function localPositionAtWorld(object, worldPosition) {
    object.parent?.updateWorldMatrix(true, false);
    return object.parent ? object.parent.worldToLocal(worldPosition.clone()) : worldPosition.clone();
  }
  function rootVectorToWorld(root, delta) {
    root.updateWorldMatrix(true, false);
    return root.localToWorld(vector(delta)).sub(root.localToWorld(new THREE.Vector3()));
  }
  function captureView() {
    const view = flyCamera.getState?.();
    return view?.position && view?.look
      ? { position: vector(view.position), look: vector(view.look), aspect: view.aspect, fov: view.fov }
      : null;
  }
  function animate(seconds, frame, complete) {
    tween = { time: 0, duration: reduced ? .10 : Math.max(.01, seconds), frame, complete };
    frame(0); changed();
  }
  function moveLocal(object, destination, seconds, complete) {
    const start = object.position.clone();
    animate(seconds, k => object.position.lerpVectors(start, destination, k), complete);
  }
  function moveWorld(object, destination, seconds, complete) {
    moveLocal(object, localPositionAtWorld(object, destination), seconds, complete);
  }
  function cameraTo(position, look, seconds, complete, id) {
    flyCamera(position, look, reduced ? .10 : seconds, () => {
      if (id === token && current) complete?.();
    });
    changed();
  }
  // A path history contains only completed waypoints. On cancellation the
  // current partial segment first reverses to its actual start, never to an
  // unvisited planned corner.
  function moveRoute(context, points, complete, record = true) {
    let index = 0;
    context.routeHistory ||= [context.object.getWorldPosition(new THREE.Vector3())];
    function next() {
      if (current !== context) return;
      if (index >= points.length) { complete(); return; }
      const destination=points[index++].clone();
      if(context.object.getWorldPosition(new THREE.Vector3()).distanceTo(destination)<1e-9){next();return;}
      moveWorld(context.object,destination,points.length>1?.48:.80,()=>{
        if(record)context.routeHistory.push(destination.clone());next();
      });
    }
    next();
  }
  function sceneRoot(name){return roots().map(a=>a.getObjectByName?.(name)).find(Boolean)||null;}
  function parkingPlans(name){
    if(name==='NayukiFantasyBox')return [{names:['TastienGanganCup','LuckinBigFishCup'],kind:'small'}];
    if(name==='TastienGanganCup')return [{names:['LuckinBigFishCup'],kind:'small'}];
    if(name==='CSGoBox')return [{names:['TastienBurgerBox'],kind:'small'}];
    if(name==='WadeLowerBox')return [{names:['GimbalRoot'],kind:'gimbal'},{names:['WadeUpperBox'],kind:'wade'}];
    return [];
  }
  function parkingJob(plan){
    const objects=plan.names.map(sceneRoot);if(objects.some(o=>!o))throw Error('Missing supported object '+plan.names.join(','));
    const bounds=new THREE.Box3(),saved=objects.map(object=>{
      object.updateWorldMatrix(true,true);bounds.union(new THREE.Box3().setFromObject(object));
      const rest=pose(object),world=object.matrixWorld.clone();object.matrixAutoUpdate=true;return {object,rest,world};
    });
    const anchor=bounds.getCenter(new THREE.Vector3()),identity=new THREE.Quaternion();
    const step=(x,y,z,yaw=0)=>({center:new THREE.Vector3(x,y,z),quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw)});
    const floor=1.1552,halfHeight=anchor.y-bounds.min.y;
    let route;
    if(plan.kind==='gimbal')route=[step(anchor.x-.08,anchor.y,anchor.z)];
    else if(plan.kind==='wade')route=[step(anchor.x,anchor.y+.50,anchor.z),step(anchor.x,anchor.y+.50,.55),step(anchor.x,anchor.y+.50,.55,Math.PI/2),step(-.36,anchor.y+.50,.35,Math.PI/2),step(-.36,floor+halfHeight,.35,Math.PI/2)];
    else route=[step(anchor.x,anchor.y+.025,anchor.z),step(anchor.x,anchor.y+.025,.47),step(-.40,anchor.y+.025,.47),step(-.40,floor+halfHeight,.47)];
    const start={center:anchor.clone(),quaternion:identity};
    return {names:plan.names,saved,anchor,route,history:[start],now:{center:anchor.clone(),quaternion:identity.clone()}};
  }
  function parkingPose(job,state){
    const change=new THREE.Matrix4().makeTranslation(...state.center.toArray())
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(state.quaternion))
      .multiply(new THREE.Matrix4().makeTranslation(-job.anchor.x,-job.anchor.y,-job.anchor.z));
    for(const {object,world}of job.saved){
      object.parent?.updateWorldMatrix(true,false);
      const matrix=change.clone().multiply(world);
      if(object.parent)matrix.premultiply(object.parent.matrixWorld.clone().invert());
      matrix.decompose(object.position,object.quaternion,object.scale);
    }
    job.now={center:state.center.clone(),quaternion:state.quaternion.clone()};changed();
  }
  function parkingRoute(context,job,route,complete,record=true){
    let index=0;function next(){
      if(current!==context)return;
      if(index>=route.length){complete();return;}
      const to=route[index++],from={center:job.now.center.clone(),quaternion:job.now.quaternion.clone()};
      if(from.center.distanceTo(to.center)<1e-9&&from.quaternion.angleTo(to.quaternion)<1e-7){next();return;}
      animate(.58,k=>parkingPose(job,{center:from.center.clone().lerp(to.center,k),quaternion:from.quaternion.clone().slerp(to.quaternion,k)}),()=>{
        if(record)job.history.push({center:to.center.clone(),quaternion:to.quaternion.clone()});next();
      });
    }next();
  }
  function parkDependents(context,complete){
    const plans=parkingPlans(context.name);let index=0;context.parking||=[];
    function next(){if(current!==context)return;if(index>=plans.length){complete();return;}
      const job=parkingJob(plans[index++]);context.parking.push(job);context.phase='parking';
      parkingRoute(context,job,job.route,next);
    }next();
  }
  function unparkDependents(context,complete){
    const jobs=[...(context.parking||[])].reverse();let index=0;
    function next(){if(current!==context)return;if(index>=jobs.length){complete();return;}
      const job=jobs[index++];parkingRoute(context,job,[...job.history].reverse(),()=>{
        for(const {object,rest}of job.saved)restore(object,rest);changed();next();
      },false);
    }next();
  }

  function inspectionEnvelope(context) {
    const {object}=context;
    const sweep=new THREE.Box3(),box=new THREE.Box3();
    let opened;
    const sample=()=>{object.updateWorldMatrix(true,true);box.setFromObject(object);sweep.union(box);return box.clone();};
    sample();
    try {
      if(context.foldJoints?.length){
        // Include intermediate folds, not just the final open silhouette. These
        // predictions are synchronous and never call changed() or animate().
        const times=new Set(Array.from({length:33},(_,i)=>i/32));
        for(const {spec} of context.foldJoints)for(const stage of spec.stages||[]){times.add(stage.start);times.add(stage.end);}
        for(const t of [...times].sort((a,b)=>a-b)){poseFolds(context,t);const bounds=sample();if(t===1)opened=bounds;}
        const known=context.spec.geometryBounds?.local?.swept;
        if(known){
          for(const x of [known.min[0],known.max[0]])for(const y of [known.min[1],known.max[1]])for(const z of [known.min[2],known.max[2]])sweep.expandByPoint(object.localToWorld(new THREE.Vector3(x,y,z)));
        }
      }else if(context.lid){
        const p=lidPositions(context);
        context.lid.position.copy(p.raised);sample();
        context.lid.position.copy(p.open);opened=sample();
      }else opened=sample();
    }finally{
      if(context.lidRest)restore(context.lid,context.lidRest);
      for(const joint of context.foldJoints||[])restore(joint.object,joint.rest);
      object.updateWorldMatrix(true,true);
    }
    const center=(opened||sweep).getCenter(new THREE.Vector3());let radius=0;
    for(const x of [sweep.min.x,sweep.max.x])for(const y of [sweep.min.y,sweep.max.y])for(const z of [sweep.min.z,sweep.max.z])radius=Math.max(radius,center.distanceTo(new THREE.Vector3(x,y,z)));
    // The anchor matches captureInspectionPose at full opening. A fixed sphere
    // around it therefore fits every later yaw/pitch, without following drags.
    return {anchor:object.worldToLocal(center),radius};
  }
  function inspectionView(context) {
    const { object } = context;
    const currentView=captureView();
    const aspect = currentView?.aspect || context.entryView?.aspect
      || (typeof innerWidth === 'number' ? innerWidth / Math.max(1, innerHeight) : 1.5);
    object.updateWorldMatrix(true, true);
    const envelope=context.inspectionEnvelope;
    const look=object.localToWorld(envelope.anchor.clone());
    const vertical=THREE.MathUtils.degToRad(currentView?.fov||context.entryView?.fov||cameraFov);
    const horizontal=2*Math.atan(Math.tan(vertical/2)*Math.max(.1,aspect));
    const distance=Math.max(.55,envelope.radius/Math.sin(Math.min(vertical,horizontal)/2)*1.08);
    // Keep the existing overhead direction where the room permits it. If the
    // ceiling limits that rise, preserve the required sphere-fit distance in
    // the horizontal plane; clamping the final camera would crop the object.
    const slope=context.simple ? .055 : .24;
    const desiredRise=distance*slope/Math.sqrt(1+slope*slope);
    const rise=constrainCameraPosition(look.clone().add(new THREE.Vector3(0,desiredRise,0))).y-look.y;
    const horizontalDistance=Math.sqrt(Math.max(0,distance*distance-rise*rise));
    let fallback=null;
    for(const angle of [0,15,-15,30,-30,45,-45,60,-60,75,-75,90,-90]){
      const yaw=THREE.MathUtils.degToRad(angle);
      const requested=look.clone().add(new THREE.Vector3(Math.sin(yaw)*horizontalDistance,rise,Math.cos(yaw)*horizontalDistance));
      const position=constrainCameraPosition(requested);
      if(position.distanceToSquared(requested)<1e-10)return {look,position};
      if(!fallback||position.distanceToSquared(look)>fallback.position.distanceToSquared(look))fallback={look,position};
    }
    // Extremely narrow split-screen windows may have no sphere-fitting point
    // anywhere in this front half-room; retain a reachable view and close path.
    return fallback;
  }
  function lidPositions(context) {
    const { object, lid, lidRest, spec } = context;
    const delta = vector(spec.openMotion.delta);
    const closedWorld = lid.parent
      ? lid.parent.localToWorld(lidRest.position.clone()) : lidRest.position.clone();
    const lift = spec.openMotion.clearanceLift ? vector(spec.openMotion.clearanceLift) : new THREE.Vector3(0, delta.y, 0);
    const raisedWorld = closedWorld.clone().add(rootVectorToWorld(object, lift));
    const openWorld = closedWorld.clone().add(rootVectorToWorld(object, delta));
    return {
      raised: localPositionAtWorld(lid, raisedWorld),
      open: localPositionAtWorld(lid, openWorld),
    };
  }
  function presentationTurn(context, pitch) {
    // Preserve the actual geometry anchor; pitch the object, not the camera.
    cardTurn(context, 0, pitch);context.presentationPitch=pitch;
  }
  function cardTurn(context, yaw, pitch = 0) {
    // These roots often have a world-zero pivot and offset vertices. Rotate
    // around the actual print centre without changing parent or local scale.
    const object = context.object;
    const anchorWorld = object.localToWorld(context.anchor.clone());
    const worldQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
      .multiply(context.restWorldQuaternion);
    const parentQuaternion = object.parent
      ? object.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    object.quaternion.copy(parentQuaternion.invert().multiply(worldQuaternion));
    object.updateWorldMatrix(true, true);
    const correction = anchorWorld.sub(object.localToWorld(context.anchor.clone()));
    const worldOrigin = object.getWorldPosition(new THREE.Vector3()).add(correction);
    object.position.copy(localPositionAtWorld(object, worldOrigin));
    context.cardYaw = yaw; context.cardPitch = pitch;
  }
  function settle(context) {
    if (current !== context) return;
    context.turnPose=captureInspectionPose(context.object);context.phase = 'open'; setBusy(false);
    caption(labels[context.name] + (context.isCard ? ' · 卡片检视' : context.simple ? ' · 拖动旋转 · 滚轮放大' : ' · 已打开，查看内部'));
    const callbacks = context.readyCallbacks.splice(0);
    callbacks.forEach(fn => fn?.(true));
  }
  function poseFolds(context,progress){
    for(const {object,spec,rest} of context.foldJoints){
      let angle=spec.closedAngle||0;
      for(const stage of spec.stages||[]){if(progress>=stage.end)angle=stage.to;else if(progress>=stage.start){const t=ease((progress-stage.start)/(stage.end-stage.start));angle=THREE.MathUtils.lerp(stage.from,stage.to,t);break;}}
      object.quaternion.copy(rest.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(vector(spec.axis).normalize(),angle));
    }
  }
  function foldAt(context,progress){
    context.foldProgress=progress;poseFolds(context,progress);changed();
  }
  function reveal(context) {
    context.phase = 'opening';
    if (context.simple) {
      // A restrained turn makes the real card thickness visible. rotate() also
      // permits drag-based inspection without needing access to the root pivot.
      const pitch=context.name==='ResumePaperRoot'?Math.PI/2-Math.atan(.055):context.name==='KeyboardRoot'?1.0:context.name==='MouseRoot'?.5:0;
      if(pitch)animate(.50,k=>presentationTurn(context,pitch*k),()=>settle(context));
      else if(context.isCard)animate(.72, k => cardTurn(context, .22 * k), () => settle(context));else settle(context);
      return;
    }
    if(context.foldJoints?.length){animate(context.spec.foldAnimation.duration||1.4,k=>foldAt(context,k),()=>settle(context));return;}
    const p = lidPositions(context);
    const duration = context.spec.openMotion.duration || .7;
    moveLocal(context.lid, p.raised, duration * .62, () => {
      moveLocal(context.lid, p.open, duration * .48, () => settle(context));
    });
  }
  function fail(context, message) {
    if (current !== context) return;
    if (context.rest) restore(context.object, context.rest);
    if (context.lidRest) restore(context.lid, context.lidRest);
    for(const joint of context.foldJoints||[])restore(joint.object,joint.rest);
    onRestore(context.name);
    current = null; tween = null; setBusy(false); caption(message); changed();
    context.readyCallbacks.forEach(fn => fn?.(false));
  }
  function start(action, callback) {
    const name = actionName(action), object = register(name);
    const context = { action, name, object, isCard: cards.has(name),simple:simple.has(name),phase: 'loading', readyCallbacks: [callback] };
    current = context; const id = ++token; setBusy(true); caption('');
    ready.then(() => {
      if (current !== context || id !== token) return;
      context.spec = entries.get(name);
      context.lid = context.simple ? null : object.getObjectByName(context.spec?.lid || name + 'Lid');
      if (!context.simple && (!context.spec || !context.lid)) {
        fail(context, '这件物品的开合素材尚未载入。'); return;
      }
      onPrepare(name);
      object.updateWorldMatrix(true, true);
      context.rest = pose(object); context.entryView = captureView();context.parking=[];
      context.worldOrigin = object.getWorldPosition(new THREE.Vector3());
      context.restWorldQuaternion = object.getWorldQuaternion(new THREE.Quaternion());
      const bounds = new THREE.Box3().setFromObject(object);
      context.originalCenter = bounds.getCenter(new THREE.Vector3());
      context.size = bounds.getSize(new THREE.Vector3());
      context.anchor = object.worldToLocal(context.originalCenter.clone());
      object.matrixAutoUpdate = true;
      if (context.lid) { context.lidRest = pose(context.lid); context.lid.matrixAutoUpdate = true; }
      context.foldProgress=0;context.foldJoints=(context.spec?.foldAnimation?.joints||[]).map(spec=>{const node=object.getObjectByName(spec.node);if(!node)throw Error('Missing fold joint '+spec.node);const rest=pose(node);node.matrixAutoUpdate=true;return {spec,object:node,rest};});
      context.inspectionEnvelope=inspectionEnvelope(context);
      // A complete rotation needs clearance for the farthest corner, including
      // the removed lid. Move into the free space in front of the desk first.
      const radius=context.size.length()*.5+(context.spec?.openMotion?.delta?vector(context.spec.openMotion.delta).length():0);
      const origin = context.worldOrigin, forward = new THREE.Vector3(0,0,Math.max(.9,1.30+radius-context.originalCenter.z));
      // Sony is behind the cups. Use the clear right-hand aisle above the hutch
      // side board, so it does not pass through the front row on its way out.
      const lift=name==='ResumePaperRoot'?.35:cards.has(name)?.028:name==='WadeUpperBox'?.50:name==='WadeLowerBox'?.86:name==='NayukiFantasyBox'?.32:0;
      // The two desk frames share a measured narrow aisle; retain scale and
      // refuse changed rest layouts rather than fall back to a colliding path.
      const deskFrame=name==='RightSmallHouseFrameRoot'||name==='RightLargeFrameRoot';
      let deskFrameLift=0;
      if(deskFrame){
        const small=name==='RightSmallHouseFrameRoot',blocker=sceneRoot(small?'RightLargeFrameRoot':'MouseRoot');
        const expectedPosition=small?[1.1160000562667847,1.280421211541583,-0.24400000274181366]:[1.1510000228881836,1.324700580875968,0.2029999941587448];
        const expectedQuaternion=small?[-0.023527661338448524,-0.43822088837623596,-0.011475205421447754,0.8984860777854919]:[-0.02897855312226992,-0.529630738766616,-0.019482795106816567,0.8475092829380273];
        const matchingRest=origin.distanceTo(new THREE.Vector3(...expectedPosition))<1e-5
          &&object.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))<1e-5
          &&context.restWorldQuaternion.toArray().every((v,i)=>Math.abs(v-expectedQuaternion[i])<1e-5);
        if(blocker)deskFrameLift=new THREE.Box3().setFromObject(blocker,true).max.y-new THREE.Box3().setFromObject(object,true).min.y+.004;
        const expectedLift=small?0.3386987276108673:0.08715637424367184;
        if(!matchingRest||Math.abs(deskFrameLift-expectedLift)>.00015){fail(context,'相框摆位已变化，暂不能沿原通道取出。');return;}
      }
      const extractionRoute = deskFrame ? [
        origin.clone().add(new THREE.Vector3(0,deskFrameLift,0)),
        origin.clone().add(new THREE.Vector3(0,deskFrameLift,forward.z)),
        origin.clone().add(forward),
      ] : lift>0 ? [
        origin.clone().add(new THREE.Vector3(0,lift,0)),origin.clone().add(new THREE.Vector3(0,lift,forward.z)),
      ] : name === 'SonyHeadphonesBox' ? [
        origin.clone().add(new THREE.Vector3(.82, 0, 0)),
        origin.clone().add(new THREE.Vector3(.82, 0, forward.z)),
        origin.clone().add(forward),
      ] : [origin.clone().add(forward)];
      if(name==='WadeUpperBox'||name==='WadeLowerBox'){
        // Lift only while crossing the packed shelf. The final open object is
        // inspected at a lower free-air stage, with room for zoom and rotation.
        const openCenter=object.localToWorld(context.inspectionEnvelope.anchor.clone());
        extractionRoute.push(origin.clone().add(new THREE.Vector3(0,3.0-openCenter.y,forward.z)));
      }
      context.route = [];context.routeHistory=[origin.clone()]; context.phase = 'preview-camera';
      const inspect = () => moveRoute(context, context.route, () => {
        context.phase = 'camera'; const view = inspectionView(context);
        cameraTo(view.position, view.look, .85, () => reveal(context), id);
      });
      const extract = () => {
        if(current!==context||id!==token)return;
        context.route=extractionRoute;context.phase='extracting';
        parkDependents(context,()=>{context.phase='extracting';inspect();});
      };
      // Focus the object where it lives before any carton, lid or blocker moves.
      // Stay in front of the eventual extraction stage; the existing final fit
      // then tightens the view after the physical move has completed.
      const routeExtent=extractionRoute.reduce((extent,p)=>{
        extent.x=Math.max(extent.x,Math.abs(p.x-origin.x));
        extent.y=Math.max(extent.y,Math.abs(p.y-origin.y));
        extent.z=Math.max(extent.z,p.z-origin.z);return extent;
      },new THREE.Vector3());
      const aspect=context.entryView?.aspect||1.5;
      const fit=Math.max(.55,(context.size.y+2*routeExtent.y)*1.85,(context.size.x+2*routeExtent.x)/aspect*1.85);
      const preview=context.originalCenter.clone().add(new THREE.Vector3(0,name==='ResumePaperRoot'?.55:.035,Math.max(fit,routeExtent.z+radius+fit)));
      cameraTo(preview,context.originalCenter.clone(),.75,extract,id);
    });
  }
  function open(action, onReady) {
    if (!canOpen(action)) return false;
    if (current?.action === action && current.phase !== 'closing') {
      if (current.phase === 'open') onReady?.(true);
      else current.readyCallbacks.push(onReady);
      return true;
    }
    if (current) {
      pending = { action, onReady };
      if (current.phase !== 'closing') close();
    } else start(action, onReady);
    return true;
  }
  function close(onDone, { restoreView = true } = {}) {
    if (!current) { onDone?.(); return false; }
    const context = current;
    context.closeCallbacks ||= [];
    if (onDone) context.closeCallbacks.push(onDone);
    if (context.phase === 'closing') return true;
    context.phase = 'closing'; context.readyCallbacks.length = 0;
    const id = ++token; tween = null; setBusy(true); caption('');
    function finished() {
      if (current !== context) return;
      if (context.lidRest) restore(context.lid, context.lidRest);
      for(const joint of context.foldJoints||[])restore(joint.object,joint.rest);
      if (context.rest) restore(context.object, context.rest);
      for(const job of context.parking||[])for(const {object,rest}of job.saved)restore(object,rest);
      onRestore(context.name);
      current = null; tween = null; changed();
      const next = pending; pending = null;
      setBusy(false);
      context.closeCallbacks.forEach(fn => fn?.());
      // A caller may open another item in onDone; do not clear that new busy
      // state or overwrite its newly-created context after the callback.
      if (next && !current) start(next.action, next.onReady);
    }
    if (!context.rest) { finished(); return true; }
    function putBack() {
      // An interrupted extraction returns through the already reached route
      // segments, not by teleporting to a point it has not visited.
      const origin = context.worldOrigin;
      const now = context.object.getWorldPosition(new THREE.Vector3());
      const route=[...(context.routeHistory||[origin.clone()])].reverse();
      const view = context.entryView || {
        look: context.originalCenter.clone(),
        position: context.originalCenter.clone().add(new THREE.Vector3(0, .30, Math.max(1.15, context.size.y * 1.6))),
      };
      const returnObject = () => moveRoute(context,route,()=>unparkDependents(context,finished),false);
      if (restoreView) cameraTo(view.position, view.look, .75, returnObject, id);
      else returnObject();
    }
    const closeLid=()=>{if(context.simple){
      // turnPose (when present) has already undone user rotation/zoom. Undo the
      // presentation tilt next, including an interrupted opening's partial tilt.
      const pitch=context.presentationPitch||0;
      if(Math.abs(pitch)>1e-8)animate(.36,k=>presentationTurn(context,pitch*(1-k)),putBack);
      else putBack();
      return;
    }
      if(context.foldJoints?.length){const from=context.foldProgress;animate((context.spec.foldAnimation.duration||1.4)*Math.max(.15,from),k=>foldAt(context,from*(1-k)),putBack);return;}
      const p = lidPositions(context);
      // If opening was interrupted while lifting, keep its present height;
      // only slide back over the mouth first, then lower onto the rim.
      const aboveClosed = context.lid.position.clone();
      const delta = aboveClosed.clone().sub(context.lidRest.position);
      const up = p.raised.clone().sub(context.lidRest.position).normalize();
      const centered = context.lidRest.position.clone().addScaledVector(up, Math.max(0, delta.dot(up)));
      moveLocal(context.lid, centered, .28, () => moveLocal(context.lid, context.lidRest.position, .42, putBack));
    };
    if(context.turnPose){const from=pose(context.object),to=context.turnPose;animate(.4,k=>{context.object.position.lerpVectors(from.position,to.position,k);context.object.quaternion.slerpQuaternions(from.quaternion,to.quaternion,k);},()=>{if(context.isCard)animate(.2,k=>cardTurn(context,.22*(1-k)),closeLid);else closeLid();});}
    else if(context.isCard){const yaw=context.cardYaw||0,pitch=context.cardPitch||0;animate(.2,k=>cardTurn(context,yaw*(1-k),pitch*(1-k)),closeLid);}
    else closeLid();
    return true;
  }
  function rotate(yawDelta, pitchDelta = 0) {
    if (current?.phase !== 'open') return false;
    turnInspectionObject(current.object,current.turnPose,yawDelta,pitchDelta);
    changed(); return true;
  }
  function refit(){
    if(!current||current.phase!=='open'||busy)return false;
    // Preserve the original return pose: only the zoom baseline is refreshed.
    // A rejected BUV fit stays put, with no camera fallback.
    if(current.name==='BUVCard'&&fixedResize){
      const context=current,fit=fixedResize(context.object,context.turnPose.anchor);
      if(!fit?.ok){changed();return false;}
      const from=context.object.position.clone();setBusy(true);
      animate(.35,k=>context.object.position.lerpVectors(from,fit.position,k),()=>{
        captureInspectionPose(context.object);setBusy(false);changed();
      });return true;
    }
    const view=inspectionView(current),id=token;
    setBusy(true);cameraTo(view.position,view.look,.35,()=>{setBusy(false);changed();},id);return true;
  }
  function update(dt) {
    if (!tween) return false;
    const a = tween;
    a.time += Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .10));
    const progress = Math.min(1, a.time / a.duration);
    a.frame(ease(progress)); changed();
    if (progress === 1 && tween === a) { tween = null; a.complete?.(); }
    return true;
  }
  return {
    canOpen, open, close, update, rotate, refit, ready,
    registerSimple(name,label){labels[name]=label;simple.add(name);return register(name);},
    get object(){return current?.object||null;},
    get active() { return current?.action || null; },
    get busy() { return busy; },
  };
}
