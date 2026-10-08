import * as THREE from './vendor/three.module.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { EffectComposer } from './vendor/EffectComposer.js';
import { CachedRoomPass, CachedAmbientOcclusionPass, ForegroundPass } from './cached-room-pass.js?v=20261007-overnight1';
import {zoomInspection,magnifyInspectionObject,captureInspectionPose,turnInspectionObject} from './inspection-turntable.js?v=20261007-overnight1';
import {pageAddress,focusFromSpread,planPageFocus,stepPageFocus,flatPageBounds,fitPageFocus,panPageFocus,zoomPageFocus,openSpreadTurnBounds} from './book-single-page-focus.js?v=20261007-overnight1';
import {createArchiveSheet} from './archive-sheet.js?v=20261007-overnight1';
import {createArchivePaperGuard} from './archive-paper-guard.js';
import {documentTranscriptCanvas} from './document-transcript.js?v=20261007-overnight1';
import {createFrameProfiler} from './frame-profiler.js?v=20261007-overnight1';
import {InspectionRenderPass,ReadingRenderPass} from './inspection-render-pass.js?v=20261007-overnight1';
import { copyView, orbitView, isReturnCorner, constrainCameraPosition } from './view-navigation.js?v=20261007-overnight1';
import {StaticRenderBatches} from './static-render-batches.js?v=20261007-overnight1';
import {createHomeViewportPolicy,homeViewportProfile,PRESET_FOV} from './home-viewport-policy.js?v=20261007-overnight1';
import {createEntranceSequence} from './entrance-sequence.js';
import {createCameraClearance,pointOnCameraRoute} from './camera-clearance.js?v=20261007-overnight1';
import { OutputPass } from './vendor/OutputPass.js';
import { paginateMemoir, paginateStudyBook, pageTexture, resolveReadingPageLayout, createLeaves, syncLeafWindow, disposeLeaves, bendPage } from './book-pages.js?v=20261007-overnight1';
import { makeOBB, obbFromLocalBounds, checkOBBPath } from './book-collision.js?v=20261007-overnight1';
import { createComputerDesktop } from './computer-desktop.js?v=20261007-overnight1';
import { createDrawingScroll } from './drawing-scroll.js?v=20261007-overnight1';
import { createCabinetInteractions } from './cabinet-interactions.js?v=20261007-overnight1';
import { applyReadableBookPrint } from './book-print.js?v=20261007-overnight1';
import { createToyPlayer } from './toy-player.js?v=20261007-overnight1';
import {createTableSafeCableGeometry} from './table-safe-cable.js?v=20261007-overnight1';
import {createInspectionCableParking} from './inspection-cable-parking.js?v=20261007-overnight1';
import {applyAppearanceTuning} from './appearance-tuning.js?v=20261007-overnight1';
import {patchCabinetTopBookPrint} from './book-stack-print.js?v=20261007-overnight1';
import { createObjectInspector } from './object-inspector.js?v=20261007-overnight1';
import {planFixedInspectionResize} from './fixed-inspection-resize.js';
import {loadResumePaper,RESUME_PAPER} from './resume-paper.js';
import {createPaperReading} from './paper-reading.js';
import { detailMaterialMesh, detailAsset } from './surfaces.js?v=20261007-overnight1';
import {createVerifiedPhotoSourceShare} from './verified-photo-source-share.js?v=20261007-overnight1';
import {addWallFrameSupport} from './wall-frame-support.js';

const $=s=>document.querySelector(s), host=$('#scene');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){$('#loading').hidden=true;$('#error').hidden=false;$('#error').textContent='当前浏览器未能开启三维画面。请开启浏览器硬件加速后重新打开。';throw e;}
// Three restores its own GL objects first; application-owned pixels and dirty
// flags are restored once all model-dependent resources are initialized.
let contextLost=false,contextRestorePending=false,contextRecoveryReady=false;
renderer.domElement.addEventListener('webglcontextlost',()=>{contextLost=true;if(contextRecoveryReady){cancelGesture();profiler.resetContext(true);}});
renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;contextRestorePending=true;if(contextRecoveryReady){restoreContextResources();renderer.compile(scene,camera);}});
function waitForUsableContext(){if(!contextLost)return Promise.resolve();return new Promise(resolve=>renderer.domElement.addEventListener('webglcontextrestored',resolve,{once:true}));}
const renderPixelRatio=()=>Math.min(2,Math.max(1.5,devicePixelRatio),Math.sqrt(5200000/(innerWidth*innerHeight)));
renderer.setPixelRatio(renderPixelRatio());renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;host.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#708895');scene.fog=new THREE.Fog('#708895',12,26);
const profiler=createFrameProfiler(renderer,new URLSearchParams(location.search).get('check')==='quality-review');
const homeViewport=createHomeViewportPolicy(innerWidth/innerHeight),initialHome=homeViewport.initial;
const camera=new THREE.PerspectiveCamera(initialHome.fov,innerWidth/innerHeight,.03,40);
const homePosition=new THREE.Vector3(...initialHome.position),homeLook=new THREE.Vector3(...initialHome.look);
camera.position.copy(homePosition);camera.lookAt(homeLook);
let mode='home',busy=false,bookOpen=false,pageIndex=0,selectedPhoto=null,hoverAction=null,drag=null,needsRender=true;
let inspectionOrigin='home',returningObject=false;
let resumePaper=null,paperReader=null,paperControls=null,paperReadButton=null;
const viewHistory=[];let lastDeskView={position:homePosition.clone(),look:homeLook.clone(),mode:'home',fov:initialHome.fov},transitioning=false,queuedAction=null,currentAction='home';
let currentLook=homeLook.clone(),camTween=null,bookTween=null,coverTween=null,pageTween=null,pageResetTween=null,pendingOrbitView=null;
const cameraClearance=createCameraClearance(scene);
let introActive=true;
const entrance=createEntranceSequence({
 overlay:$('#loading'),host,errorPanel:$('#error'),clearance:cameraClearance,
 getHome:()=>homeViewportProfile(camera.aspect),reducedMotion:reduced,
 blockedElements:[$('#object-controls'),$('#keyboard-access'),$('#book-toc')],
 applyView(view){camera.position.copy(view.position);currentLook.copy(view.look);camera.fov=view.fov;camera.updateProjectionMatrix();camera.lookAt(currentLook);needsRender=true;},
 onLockChange(locked){introActive=locked;if(!locked)updateControls();},
 onComplete(home){
  homeViewport.commit({...home,position:home.position.toArray(),look:home.look.toArray()});
  homePosition.copy(home.position);homeLook.copy(home.look);
  mode='home';currentAction='home';busy=false;transitioning=false;returningObject=false;
  queuedAction=null;camTween=null;pendingOrbitView=null;
  lastDeskView={position:home.position.clone(),look:home.look.clone(),mode:'home',fov:home.fov};updateControls();
 }
});
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),clock=new THREE.Clock();
const interactive=[],photos=[],pages=[];
const collectibleViews=new Map();
const material=(color,roughness=.7,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const M={wood:material('#7e8178'),edge:material('#a2a292'),cream:material('#e2ddc4'),dark:material('#171e21'),black:material('#11191c'),paper:material('#ddd8c6'),wall:material('#738784'),gold:material('#bd9258',.4,.7),white:material('#e2e3d6'),red:material('#8c3432'),cloth:material('#677577'),felt:material('#596258')};

function box(w,h,d,mat,x=0,y=0,z=0,parent=scene){const rounded=Math.min(w,h,d)>.014&&!Array.isArray(mat);const geometry=rounded?new RoundedBoxGeometry(w,h,d,2,Math.min(.012,Math.min(w,h,d)*.18)):new THREE.BoxGeometry(w,h,d);const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cyl(rt,rb,h,mat,x,y,z,parent=scene,seg=24){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function sphere(r,mat,x,y,z,parent=scene,sx=1,sy=1,sz=1){const m=new THREE.Mesh(new THREE.SphereGeometry(r,20,12),mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;}
function plane(w,h,mat,x,y,z,parent=scene){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(x,y,z);m.receiveShadow=true;parent.add(m);return m;}
function mark(group,action){if(!group)throw new Error('Missing interactive model for '+action);group.userData.action=action;interactive.push(group);return group;}
async function loadJSON(url){const response=await fetch(url);if(!response.ok)throw new Error('Cannot load room asset '+url+' ('+response.status+')');return response.json();}
function canvasTexture(w,h,draw){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;}
function textMat(text,bg='#eee5cc',fg='#364746',size=28){const t=canvasTexture(512,256,(c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font=`${size}px "Microsoft YaHei",sans-serif`;c.fillText(text,w/2,h/2);});return new THREE.MeshStandardMaterial({map:t,roughness:.9});}
function tube(points,r,mat,parent=scene){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const m=new THREE.Mesh(new THREE.TubeGeometry(curve,28,r,8,false),mat);parent.add(m);m.castShadow=true;return m;}
const hemi=new THREE.HemisphereLight('#d2e3e6','#7b6752',2.2);scene.add(hemi);
const sunlight=new THREE.SpotLight('#f3f5ff',42,12,1.05,.82,2);sunlight.position.set(-3.2,4.45,2.4);sunlight.target.position.set(0,1.85,-.35);scene.add(sunlight.target);sunlight.shadow.camera.near=.15;sunlight.shadow.camera.far=14;sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);sunlight.shadow.normalBias=.0025;sunlight.shadow.bias=-.00015;scene.add(sunlight);
const fill=new THREE.DirectionalLight('#b2d0df',.75);fill.position.set(3,3,2);scene.add(fill);
// The reference is a blue-grey room. Neutral daylight preserves the black
// nylon, silver-grey furniture and cream cabinet; a gentle warm bounce stays
// local to the desk instead of tinting every material green or brown.
M.felt.color.set('#ffffff');sunlight.color.set('#f3f5ff');sunlight.intensity=42;hemi.color.set('#dce9ff');hemi.groundColor.set('#a29b91');hemi.intensity=.55;fill.color.set('#d5e3f1');fill.intensity=.16;const roomAmbient=new THREE.AmbientLight('#f0eee8',.075);scene.add(roomAmbient);sunlight.shadow.radius=6;sunlight.shadow.blurSamples=16;sunlight.shadow.normalBias=.0025;
const warmDeskLight=new THREE.SpotLight('#fff1d7',12,10,.78,.72,2);warmDeskLight.position.set(-2.05,3.70,1.50);warmDeskLight.target.position.set(.08,1.12,-.12);warmDeskLight.castShadow=true;warmDeskLight.shadow.mapSize.set(2048,2048);warmDeskLight.shadow.normalBias=.002;warmDeskLight.shadow.radius=5;scene.add(warmDeskLight,warmDeskLight.target);
let roomEnvironmentTarget=null;
function createRoomEnvironment(){
 const generator=new THREE.PMREMGenerator(renderer),environmentScene=new RoomEnvironment();let next;
 try{next=generator.fromScene(environmentScene,.025);}finally{environmentScene.dispose();generator.dispose();}
 const previous=roomEnvironmentTarget;roomEnvironmentTarget=next;previous?.dispose();return next.texture;
}
scene.environment=createRoomEnvironment();scene.environmentIntensity=.26;
// Paint, wood and cloth respond to real light; there are no baked photo shadows.
const wallMaterial=material('#728e9f',.88);
const rearWallGeometry=new THREE.PlaneGeometry(8,4.8,140,84);
const wallPositions=rearWallGeometry.attributes.position;
for(let i=0;i<wallPositions.count;i++){
 const x=wallPositions.getX(i),y=wallPositions.getY(i);
 wallPositions.setZ(i,.00020*Math.sin(x*18+y*3)*Math.sin(y*23)+.00012*Math.sin(x*47+y*37));
}
rearWallGeometry.computeVertexNormals();
const rearWall=new THREE.Mesh(rearWallGeometry,wallMaterial);rearWall.position.set(0,2.3,-1.31);rearWall.receiveShadow=true;scene.add(rearWall);detailMaterialMesh(rearWall,'paint',10);
for(const x of [-3.9,3.9]){const side=new THREE.Mesh(new THREE.BoxGeometry(.12,4.8,8),wallMaterial.clone());side.position.set(x,2.3,.8);side.receiveShadow=true;scene.add(side);detailMaterialMesh(side,'paint',10);}
const ceiling=box(7.8,.08,6.12,material('#d2d5d7',.96),0,4.74,1.75);ceiling.name='RoomCeiling';ceiling.castShadow=false;detailMaterialMesh(ceiling,'paint',7);
const frontWall=box(7.8,4.8,.12,wallMaterial.clone(),0,2.3,4.86);frontWall.name='RoomFrontWall';frontWall.castShadow=false;detailMaterialMesh(frontWall,'paint',10);
const floorBase=material('#58554f',.9);box(8,.12,8,floorBase,0,-.085,.8);
for(let row=0;row<20;row++)for(let segment=0;segment<4;segment++){
 const m=material(['#766f65','#7b7469','#716b63','#80796d'][(row*3+segment)%4],.73);
 const plank=box(.399,.045,1.998,m,-3.79+row*.4,-.026,-2.2+segment*2+(row%2)*.85);
 detailMaterialMesh(plank,'wood',4);
}
const skirting=material('#ced1d1',.64);
box(8,.125,.046,skirting,0,.05,-1.272);box(8,.018,.057,skirting,0,.119,-1.269);
// Contact shading reinforces the actual gaps, rounded edges and cloth folds.
const composer=new EffectComposer(renderer);
const dynamicScreenScene=new THREE.Scene();
const drawingScene=new THREE.Scene();drawingScene.environment=scene.environment;drawingScene.environmentIntensity=scene.environmentIntensity;
for(const light of [hemi,sunlight,fill,warmDeskLight,roomAmbient]){const copy=light.clone();copy.castShadow=false;drawingScene.add(copy);if(copy.target){copy.target=light.target.clone();drawingScene.add(copy.target);}}
const drawingPass=new ForegroundPass(drawingScene,camera);
const inspectionPass=new InspectionRenderPass(scene,camera,[hemi,sunlight,fill,warmDeskLight,roomAmbient]);
const readingPass=new ReadingRenderPass(scene,camera,[hemi,sunlight,fill,warmDeskLight,roomAmbient]);
const archiveScene=new THREE.Scene();archiveScene.environment=scene.environment;archiveScene.environmentIntensity=scene.environmentIntensity;
archiveScene.add(new THREE.HemisphereLight('#ffffff','#d2c9b6',2.2));
const archivePass=new ForegroundPass(archiveScene,camera);
const archiveSheet=createArchiveSheet({scene:archiveScene,camera,reduced,movementGuard:createArchivePaperGuard(scene,camera),onChange(){needsRender=true;},onState(phase,title){if(phase==='returning')cancelGesture();busy=phase==='extracting'||phase==='returning'||phase==='adjusting';caption(phase==='idle'?'点纸张可从文件袋中抽出':'');updateControls();}});
const archiveControls=document.createElement('div');archiveControls.id='archive-controls';archiveControls.hidden=true;
const archiveDragMode=document.createElement('button');archiveDragMode.dataset.archiveMode='true';archiveDragMode.addEventListener('click',()=>{cancelGesture();archiveSheet.setInteraction(archiveSheet.interaction==='read'?'rotate':'read');});archiveControls.append(archiveDragMode);
for(const [label,textMode]of [['清晰文字',true],['页面图像',false]]){const button=document.createElement('button');button.textContent=label;button.dataset.textMode=String(textMode);button.addEventListener('click',()=>archiveSheet.setTextMode(textMode));archiveControls.append(button);}$('#object-controls').prepend(archiveControls);
const roomPass=new CachedRoomPass(scene,camera,dynamicScreenScene);
const ambientOcclusion=new CachedAmbientOcclusionPass(scene,camera,innerWidth,innerHeight,16);
ambientOcclusion.kernelRadius=.12;ambientOcclusion.minDistance=.00025;ambientOcclusion.maxDistance=.010;
composer.addPass(roomPass);composer.addPass(ambientOcclusion);composer.addPass(inspectionPass);composer.addPass(readingPass);composer.addPass(archivePass);composer.addPass(drawingPass);composer.addPass(new OutputPass());
// Geometry edges use 4x MSAA in the beauty target. Post-processing full-screen
// quads need no second multisampled buffer; type still renders at full resolution.
// Furniture and keepsakes use modeled silhouettes; image maps are limited to printed artwork.
const gltfLoader=new GLTFLoader();let loadedModelCount=0;const sharedOwnerPhoto=createVerifiedPhotoSourceShare();
const modelNames=['desk-furniture','desk-keepsakes','desk-electronics','room-bed','mcdonalds-collectible','school-keepsakes','top-packaging-openable','desk-video-details','desk-figurine','collectible-replacements','tastien-cup-hd','cat-cup-hd','shelf-details-v2','cs2-collectible-box','branded-cartons-refined','cs2-butterfly-emerald','desk-support-refined','disney-fox-charm','jordan-backpack-refined','card-supports'];
entrance.progress({phase:'models',loaded:0,total:modelNames.length});
const assets=await Promise.all(modelNames.map(async name=>{
  const gltf=await gltfLoader.loadAsync(`assets/${name}.glb?v=20261007-overnight1`),{scene:asset,animations}=gltf;asset.animations=animations;
  asset.name=name;asset.traverse(o=>{if(o.isMesh){const materials=Array.isArray(o.material)?o.material:[o.material];o.castShadow=!materials.every(m=>(m.transmission||0)>.5);o.receiveShadow=true;for(const m of materials){if(m.map)m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}}});
  detailAsset(asset);await sharedOwnerPhoto.consider(name,gltf);scene.add(asset);entrance.progress({phase:'models',loaded:++loadedModelCount,total:modelNames.length});return asset;
}));
sharedOwnerPhoto.commit();
const [furniture,keepsakes,electronics]=assets;
entrance.progress({phase:'layout'});
const shelfReplacement=await loadJSON('assets/shelf-details-v2-manifest.json?v=20261007-overnight1');
for(const [assetName,names] of Object.entries(shelfReplacement.replace||{}))for(const name of names)assets.find(a=>a.name===assetName)?.getObjectByName(name)?.removeFromParent();
// This hollow binder has separate envelopes/sleeves; discard its former solid-paper edge strips.
assets.find(a=>a.name==='shelf-details-v2')?.getObjectByName('BinderRight02_FinePaperEdges')?.removeFromParent();
for(const [index,name] of [[0,'IttoArtCard'],[8,'DeskFigurineRoot'],[4,'CSGOBalisongDisplay'],[9,'CSGOBalisongDisplay'],[1,'TastienGanganCup'],[1,'LuckinCatCup']])assets[index].getObjectByName(name)?.removeFromParent();
for(const name of ['CSGoBox','NayukiFantasyBox','TastienBurgerBox'])assets[6].getObjectByName(name)?.removeFromParent();
const assetObject=name=>assets.map(a=>a.getObjectByName(name)).find(Boolean);
const supportManifest=await loadJSON('assets/desk-support-refined-manifest.json?v=20261007-overnight1');
for(const [assetName,names]of Object.entries(supportManifest.replace||{}))for(const name of names)assets.find(a=>a.name===assetName)?.getObjectByName(name)?.removeFromParent();
for(const correction of supportManifest.recommendedExistingObjectCorrections||[]){
 if(correction.remove)assetObject(correction.remove)?.removeFromParent();
 else if(correction.delta)assetObject(correction.root)?.position.add(new THREE.Vector3(...correction.delta));
}
const backpackManifest=await loadJSON('assets/jordan-backpack-refined-manifest.json?v=20261007-overnight1');
const replacementBackpack=assets[18]?.getObjectByName('JordanBackpackRoot');
if(replacementBackpack){assets[7].getObjectByName('JordanBackpackRoot')?.removeFromParent();assets[7].attach(replacementBackpack);}
const foxManifest=await loadJSON('assets/disney-fox-charm-manifest.json?v=20261007-overnight1');
const foxCharm=assetObject(foxManifest.root),backpack=assetObject(foxManifest.parentRoot);
if(backpack&&foxCharm){assetObject(foxManifest.replaceRoot)?.removeFromParent();backpack.updateWorldMatrix(true,true);foxCharm.updateWorldMatrix(true,true);backpack.attach(foxCharm);if(backpackManifest.charmBagLocalAnchor)foxCharm.position.fromArray(backpackManifest.charmBagLocalAnchor);foxCharm.quaternion.identity();foxCharm.scale.setScalar(1);}
if(backpack&&backpackManifest.bagAndCharmGeometryBounds)backpack.userData.inspectionBounds=backpackManifest.bagAndCharmGeometryBounds;
const knifeManifest=await loadJSON('assets/cs2-butterfly-emerald-manifest.json?v=20261007-overnight1'),mechanicalToy=assetObject('CSGOBalisongDisplay');if(mechanicalToy){mechanicalToy.userData.inspectionSweep=knifeManifest.identityDisplaySweptBounds||knifeManifest.displaySweptBounds;mechanicalToy.userData.displayRootQuaternion=knifeManifest.displayRootQuaternion;}
for(const name of ['SonyHeadphonesBox','NayukiFantasyBox','TastienBurgerBox','CSGoBox','WadeUpperBox','WadeLowerBox','UpperYellowBox'])furniture.getObjectByName(name)?.removeFromParent();
// Measured bottom vertices against their real supporting triangle surfaces.
// Apply before controllers capture rest transforms; move a stacked group together.
for(const [name,dy]of [['WadeLowerBox',-.0202999447],['WadeUpperBox',-.0314999290],['UpperYellowBox',-.00262156664546135],['NayukiFantasyBox',-.0053999756],['TastienGanganCup',-.0053999756],['LuckinBigFishCup',-.0073999756],['LuckinCatCup',.0192],['RightLargeFrameRoot',.0056]])assetObject(name)?.position.add(new THREE.Vector3(0,dy,0));
// Seat the cat cup fully on the shelf while retaining the stacked box clearances.
for(const [name,dz]of [['LuckinCatCup',-.16],['WadeLowerBox',-.14],['WadeUpperBox',-.14]])assetObject(name)?.position.add(new THREE.Vector3(0,0,dz));
let toyReturnCallback=null;
const toys=createToyPlayer({THREE,assets,onChange(event){needsRender=true;if(event.reason!=='inspection-rotate'&&event.state.knife!=='inspecting')renderer.shadowMap.needsUpdate=true;
 if(event.reason==='displayed'||event.reason==='inspection-ready'){const object=toys.getObject(event.item);if(object){const bounds=new THREE.Box3().setFromObject(object),target=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());let distance=Math.max(.55,size.y*1.6,size.x/camera.aspect*1.6);const sweep=object.userData.inspectionSweep;if(sweep){target.copy(object.localToWorld(new THREE.Vector3(...sweep.center)));const angle=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));distance=sweep.radius*1.14/Math.sin(angle);}flyCamera(target.clone().add(new THREE.Vector3(0,0,distance)),target,.65,()=>{if(event.reason==='inspection-ready')toys.inspectKnife({draw:true});else{busy=false;updateControls();}});}else{busy=false;updateControls();}}
 if(event.reason==='inspection-start'){busy=true;caption('');updateControls();}
 if(event.reason==='inspection-finished'){busy=false;caption('');updateControls();}
 if(event.reason==='stored'&&toyReturnCallback){const cb=toyReturnCallback;toyReturnCallback=null;cb();}
}});
function contentId(action){return action==='collectible:CSGoBox'?'knife':action==='collectible:NayukiFantasyBox'?'cup':null;}
for(const [item,action]of [['knife','collectible:CSGoBox'],['cup','collectible:NayukiFantasyBox']]){const object=toys.getObject(item);if(object)mark(object,action);}
// Keep the case on its supporting top board while separating the three
// adjacent packages. ToyPlayer captured its original rest pose above and
// follows this delta for the knife stored inside the case.
assetObject('CSGoBox')?.position.set(-.040,-.01150,-.075);
assetObject('McDonaldsDoraemonRoot')?.position.set(.600,2.80901,-.634);
assetObject('SonyHeadphonesBox')?.position.set(0,-.02299,-.078);
// Seat the front row and its card slots before controllers capture rest poses.
const frontLayout=await loadJSON('assets/front-layout-blocking-manifest.json?v=20261007-overnight1');
for(const [name,delta]of Object.entries(frontLayout.deltas||{}))assetObject(name)?.position.add(new THREE.Vector3(...delta));
// Fit the existing small-frame toe after final placement, before any rest/cache capture.
// Only its lower support vertices change; source GLB, print UVs and lean stay intact.
{
 const frame=assetObject('RightSmallHouseFrameRoot'),toe=frame?.getObjectByName('Small_house_real_folding_rear_support');
 if(frame&&toe&&!frame.userData.smallHouseSupport0630){
  const p=toe.geometry.attributes.position,low=[];
  for(let i=0;i<p.count;i++)if(p.getY(i)<-.124999)low.push(i);
  const matchingPose=frame.position.distanceTo(new THREE.Vector3(...[1.1160000562667847,1.2860548496246338,-0.24400000274181366]))<1e-6
   &&frame.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-6
   &&frame.quaternion.toArray().every((v,i)=>Math.abs(v-[-0.023527661338448524,-0.43822088837623596,-0.011475205421447754,0.8984860777854919][i])<1e-6);
  if(p.count===24&&low.length===12&&matchingPose){
   toe.geometry=toe.geometry.clone();const v=toe.geometry.attributes.position;
   for(const i of low)v.setY(i,v.getY(i)+0.005240772505777515);
   v.needsUpdate=true;toe.geometry.computeVertexNormals();toe.geometry.computeBoundingBox();toe.geometry.computeBoundingSphere();
   frame.position.y=1.280421211541583;frame.userData.smallHouseSupport0630=true;
  }
 }
}

// Seat this frame on the actual raised mouse-pad seam and far pad surface.
// The small roll is a measured contact solution, not an arbitrary styling offset.
{
 const frame=assetObject('RightLargeFrameRoot'),toe=frame?.getObjectByName('Large_frame_real_folding_rear_support');
 if(frame&&toe&&!frame.userData.largeFrameSupport0700){
  const p=toe.geometry.attributes.position,low=[];
  for(let i=0;i<p.count;i++)if(p.getY(i)<-0.16349899606609344)low.push(i);
  const matchingPose=frame.position.distanceTo(new THREE.Vector3(...[1.1510000228881836,1.3318006044387818,0.2029999941587448]))<1e-6
   &&frame.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-6
   &&frame.quaternion.toArray().every((v,i)=>Math.abs(v-[-0.029596487060189247,-0.5295965671539307,-0.01849393919110298,0.8475314378738403][i])<1e-6);
  if(p.count===24&&low.length===12&&matchingPose){
   toe.geometry=toe.geometry.clone();const v=toe.geometry.attributes.position;
   for(const i of low)v.setY(i,v.getY(i)+0.006224109187862059);
   v.needsUpdate=true;toe.geometry.computeVertexNormals();toe.geometry.computeBoundingBox();toe.geometry.computeBoundingSphere();
   frame.position.fromArray([1.1510000228881836,1.324700580875968,0.2029999941587448]);frame.quaternion.fromArray([-0.02897855312226992,-0.529630738766616,-0.019482795106816567,0.8475092829380273]);frame.userData.largeFrameSupport0700=true;
  }
 }
}
toys.update(0);
function closeInspector(done,options){paperReader?.cancel();const item=contentId(inspector.active),state=toys.getState();if(item&&state[item]==='displayed'){busy=true;updateControls();toyReturnCallback=()=>inspector.close(done,options);toys.hide(item);}else inspector.close(done,options);}


const shelfMemory=mark(furniture.getObjectByName('ShelfRoot'),'shelf');
mark(furniture.getObjectByName('TopBoxesRoot'),'souvenirs');
const souvenirs=mark(keepsakes.getObjectByName('SouvenirsRoot'),'souvenirs');
for(const [root,label] of [
 ['BUVCard','几何艺术卡片'],
 ['LuckinCatCup','猫形纸杯'],
 ['TastienGanganCup','几何图案纸杯'],
 ['LuckinBigFishCup','海蓝纸杯'],
 ['CSGoBox','机械玩具收藏盒'],
 ['NayukiFantasyBox','金属杯收纳盒'],
 ['SonyHeadphonesBox','耳机收纳盒'],
 ['IttoArtCard','色彩艺术卡片'],
 ['TastienBurgerBox','折叠纸盒'],
 ['McDonaldsDoraemonRoot','旋转桌面玩具'],
 ['DeskFigurineRoot','几何桌面挂件'],
 ['WadeUpperBox','上层收纳盒'],['WadeLowerBox','下层收纳盒'],['UpperYellowBox','书摞上的黄色纸盒'],
]){
 const object=assets.map(asset=>asset.getObjectByName(root)).find(Boolean);
 if(object){const action='collectible:'+root;mark(object,action);collectibleViews.set(action,{object,label});}
}
// The three brown bottles and the complete red hanging ornament were removed from the source asset.
keepsakes.getObjectByName('BUVCard')?.traverse(o=>{if(o.isMesh&&o.material?.map){const m=o.material;o.material=new THREE.MeshPhysicalMaterial({map:m.map,color:m.color,side:m.side,roughness:.25,metalness:.035,clearcoat:.88,clearcoatRoughness:.13,iridescence:.12,iridescenceIOR:1.3,iridescenceThicknessRange:[100,260]});}});
const deskObjects=mark(keepsakes.getObjectByName('DeskSmallObjectsRoot'),'deskObjects');
// Virtual installation detail; these discreet tabs stay fixed to the cabinet.
addWallFrameSupport(THREE,scene,assets);
const deskFrames=assetObject('RightLargeFrameRoot');
const activeLaptop=mark(electronics.getObjectByName('LaptopRoot'),'computer');
activeLaptop.position.set(.35,1.155,.005);activeLaptop.rotation.y=-.045;
const activeKeyboard=mark(electronics.getObjectByName('KeyboardRoot'),'keyboard');
activeKeyboard.position.set(.22,1.155,.59);activeKeyboard.rotation.y=-.075;
const mouse=electronics.getObjectByName('MouseRoot');mouse.position.set(1.04,1.162,.48);
const mousePad=electronics.getObjectByName('MousePadRoot');mousePad.position.set(1.01,1.156,.44);
const headphones=electronics.getObjectByName('HeadphonesRoot'),gimbal=electronics.getObjectByName('GimbalRoot');
gimbal.position.set(-.67,1.155,-.12);gimbal.rotation.y=.1;gimbal.add(headphones);headphones.position.set(-.095,.211741075,.11);headphones.rotation.set(0,-.15,0);
const desktop=createComputerDesktop({THREE,onExternalLink(url){window.open(url,'_blank','noopener,noreferrer');},onChange(){needsRender=true;}});
// The native pointer is already precisely over the projected screen. Keeping it
// out of the texture removes a full 1600x1000 GPU upload for every mouse move.
desktop.setExternalCursor(true);
// The exported glTF has top-origin texture V coordinates.
desktop.texture.flipY=false;
const activeScreen=electronics.getObjectByName('ScreenDisplay');
activeScreen.material=new THREE.MeshBasicMaterial({map:desktop.texture,toneMapped:false});
activeScreen.geometry.computeBoundingBox();
const screenCopy=new THREE.Mesh(activeScreen.geometry,activeScreen.material);screenCopy.matrixAutoUpdate=false;dynamicScreenScene.add(screenCopy);
const screenCenter=()=>activeScreen.localToWorld(activeScreen.geometry.boundingBox.getCenter(new THREE.Vector3()));
activeScreen.userData.screen=true;activeScreen.userData.action='computer';
const drawing=createDrawingScroll({scene,camera,renderer,foregroundScene:drawingScene,onChange(event={}){needsRender=true;if(event.geometry){renderer.shadowMap.needsUpdate=true;roomPass.invalidate();ambientOcclusion.invalidate();}}});
let desktopCapture=false,lastScreenUV=null,drawingCapture=false,drawingEntryView=null,activePointerId=null;
const desktopTouches=new Map();let desktopTouchMode=null;
// One continuous headset lead. Both ends belong to their actual device,
// independently of which root is being inspected or moved.
for(const name of ['Headphone_attached_cable','Laptop_connected_headphone_lead'])electronics.getObjectByName(name)?.removeFromParent();
const headsetLead=tube([[-.945,1.385,.005],[-1.00,1.164,.16],[-.78,1.164,.20],[-.46,1.164,.19],[-.20,1.175,.12],[-.092,1.216,.083]],.0022,material('#151916',.68));
headsetLead.name='Headset lead connected to laptop';
const leadCopy=new THREE.Mesh(headsetLead.geometry,headsetLead.material);leadCopy.visible=false;leadCopy.frustumCulled=false;inspectionPass.scene.add(leadCopy);
const leadFromLocal=new THREE.Vector3(-.19082,.01786,.01598),leadEndRoot=electronics.getObjectByName('LaptopStandRoot'),leadAngle=THREE.MathUtils.degToRad(8),leadToLocal=new THREE.Vector3(-.466,.055+.024*Math.cos(leadAngle)-.102*Math.sin(leadAngle),.024*Math.sin(leadAngle)+.102*Math.cos(leadAngle));
let lastLeadFrom=null,lastLeadTo=null;
function updateHeadsetLead(){
 headphones.updateWorldMatrix(true,false);leadEndRoot.updateWorldMatrix(true,false);const a=headphones.localToWorld(leadFromLocal.clone()),b=leadEndRoot.localToWorld(leadToLocal.clone());
 if(lastLeadFrom&&a.distanceToSquared(lastLeadFrom)<1e-10&&b.distanceToSquared(lastLeadTo)<1e-10)return;
 const restingRoute=a.z<.24&&Math.abs(a.x+.945)<.10;
 let points;if(restingRoute){points=[a,new THREE.Vector3(-1.00,1.21,.09),new THREE.Vector3(-1.00,1.164,.16),new THREE.Vector3(-.78,1.164,.20),new THREE.Vector3(-.46,1.164,.19),new THREE.Vector3(-.20,1.175,.12),b];}
 else points=Array.from({length:13},(_,i)=>{const t=i/12,p=a.clone().lerp(b,t);p.y=Math.max(1.15725,p.y-.26*Math.sin(Math.PI*t));return p;});
 const old=headsetLead.geometry;headsetLead.geometry=createTableSafeCableGeometry(THREE,points,{tableContactIndices:restingRoute?[2,3,4]:[]}).geometry;leadCopy.geometry=headsetLead.geometry;old.dispose();lastLeadFrom=a;lastLeadTo=b;needsRender=true;
}
// Photo board is a physical object fixed in the same room, not a replacement view.
const wallBoard=mark(new THREE.Group(),'wall');wallBoard.position.set(2.38,2.34,-.84);wallBoard.rotation.y=-.32;scene.add(wallBoard);
box(1.80,1.68,.075,material('#6f5940'),0,0,0,wallBoard);box(1.72,1.60,.021,M.felt,0,0,.049,wallBoard);
const feltTexture=canvasTexture(256,256,(c,w,h)=>{c.fillStyle='#646a5f';c.fillRect(0,0,w,h);for(let i=0;i<18000;i++){const x=Math.random()*w,y=Math.random()*h;c.fillStyle=i%2?'#747b6a70':'#404c4150';c.fillRect(x,y,.8,1.8);}});M.felt.map=feltTexture;
const mapTexture=canvasTexture(900,780,(c,w,h)=>{c.fillStyle='#d1bd90';c.fillRect(0,0,w,h);c.fillStyle='#5c6958';c.font='32px "SimSun",serif';c.textAlign='center';c.fillText('想象旅程示意图',450,60);});
const mapPaper=plane(.91,.79,new THREE.MeshStandardMaterial({map:mapTexture,roughness:1}),-.17,.02,.066,wallBoard);mapPaper.rotation.z=-.04;
function pin(x,y,parent=wallBoard){cyl(.008,.008,.025,M.gold,x,y,.09,parent).rotation.x=Math.PI/2;sphere(.012,material('#8f3d31'),x,y,.11,parent);}
pin(-.17,.40);
function physicalPhoto(texture,w,h,x,y,angle,name){const g=new THREE.Group();g.position.set(x,y,.09);g.rotation.z=angle;wallBoard.add(g);box(w+.03,h+.075,.008,material('#ece5d3'),0,-.013,0,g);const p=plane(w,h,new THREE.MeshStandardMaterial({map:texture,roughness:.68}),0,.015,.005,g);mark(g,'photo:'+name);photos.push({group:g,name});pin(x,y+h/2+.025);return g;}
const imageLoader=new THREE.TextureLoader();let coverImage=null;
const coverPhoto=await imageLoader.loadAsync('assets/cover-photo.jpg');coverPhoto.colorSpace=THREE.SRGBColorSpace;coverPhoto.anisotropy=8;coverImage=coverPhoto.image;
const deskPhoto=await imageLoader.loadAsync('assets/my-desk.jpg');deskPhoto.colorSpace=THREE.SRGBColorSpace;deskPhoto.anisotropy=8;
physicalPhoto(coverPhoto,.255,.362,.58,.40,-.07,'封面示例图');physicalPhoto(deskPhoto,.27,.36,.57,-.28,.055,'书桌示例图');
for(const [x,y,rot,txt] of [[-.62,.55,.04,'窗边的光'],[-.66,-.52,-.1,'票根与旧物'],[.05,-.58,.04,'日子与远方']]){const note=plane(.36,.22,textMat(txt,'#d3bd83','#5a654e',29),x,y,.09,wallBoard);note.rotation.z=rot;pin(x,y+.105);}
const [shelfData, textbookData, memoirData]=await Promise.all(['shelf-books','textbook-content','memoir-chapter-one'].map(name=>loadJSON(`assets/${name}.json?v=20261007-overnight1`)));
const mainBookTitle=memoirData.title||'纸上空间';
// The same volumetric book moves from its desk location to the camera and back.
let BW=.47,BH=.67;let book=mark(new THREE.Group(),'book');book.name='autobiography';scene.add(book);let deskBookPos=new THREE.Vector3(-1.10,1.504853197,.49),deskBookQuat=new THREE.Quaternion().setFromEuler(new THREE.Euler(-8*Math.PI/180,0,0));book.position.copy(deskBookPos);book.quaternion.copy(deskBookQuat);
const coverTexture=canvasTexture(1680,2388,(c)=>{c.scale(2,2);const w=840,h=1194;c.drawImage(coverImage,0,0,w,h);const gr=c.createLinearGradient(0,0,w,0);gr.addColorStop(0,'rgba(4,29,34,.38)');gr.addColorStop(.6,'rgba(4,29,34,0)');c.fillStyle=gr;c.fillRect(0,0,w,h);});
const coverMat=new THREE.MeshStandardMaterial({map:coverTexture,roughness:.5});const binding=material('#24444a',.52),inside=material('#d8d0b8',.88);
box(BW+.016,BH+.018,.011,binding,BW/2,0,-.017,book);box(.014,BH+.018,.070,binding,-.009,0,.012,book);
const paperBlock=box(BW-.012,BH-.008,.038,M.paper,BW/2,0,.009,book);
for(let i=0;i<8;i++)box(.0015,BH-.01,.001,material('#b7ae95'),BW-.007,0,-.005+i*.0044,book);
let coverHinge=new THREE.Group();coverHinge.position.set(0,0,.042);book.add(coverHinge);const frontCover=box(BW+.012,BH+.018,.012,[binding,binding,binding,binding,coverMat,inside],BW/2,0,0,coverHinge);frontCover.userData.action='book';
const spineTexture=canvasTexture(128,2048,(c,w,h)=>{c.fillStyle='#24444a';c.fillRect(0,0,w,h);c.fillStyle='#d7c29c';c.textAlign='center';c.textBaseline='middle';c.font='100px "SimSun",serif';Array.from(mainBookTitle).forEach((s,i)=>c.fillText(s,w/2,350+i*224));c.fillRect(24,160,80,3);c.fillRect(24,h-180,80,3);});
const coverSpineText=plane(.033,.53,new THREE.MeshStandardMaterial({map:spineTexture,roughness:.51}),-.017,0,.014,book);coverSpineText.rotation.y=-Math.PI/2;
const replacedBookNames=new Set(shelfReplacement.replace?.['desk-furniture']||[]);
shelfData.books=[...shelfData.books.filter(spec=>!replacedBookNames.has(spec.root)),...(shelfReplacement.books||[])];
const memoir=paginateMemoir(memoirData);
const identities=await loadJSON('assets/book-identities.json?v=20261007-overnight1');
const [refinedStudy,bookSources]=await Promise.all(['book-content-refined','book-sources'].map(name=>loadJSON(`assets/${name}.json?v=20261007-overnight1`)));
const yongwaiSources=await loadJSON('assets/yongwai/manifest.json?v=20261007-overnight1');
const documentTranscripts=await fetch('assets/yongwai-scanned/public-transcripts.json?v=20261007-overnight1').then(r=>r.ok?r.json():{documents:[]}).catch(()=>({documents:[]}));
const yongwaiPages=await Promise.all(yongwaiSources.map(async(page)=>{const texture=await imageLoader.loadAsync(page.src);const image=texture.image;texture.dispose();const transcription=documentTranscripts.documents.find(d=>d.id===page.id);return {type:'archive-photo',heading:page.title,image,textImage:transcription?documentTranscriptCanvas(transcription):null,rotate:page.rotate||0};}));
const bookCatalog=new Map();
let activeBookAction='book',pendingBookFit=false,pendingInspectionFit=false,readingOrigin='home',readingRoute=null;
let bookInspectionPose=null;
const boundsFrom=data=>new THREE.Box3(new THREE.Vector3(...data.min),new THREE.Vector3(...data.max));
const poseOf=object=>({position:object.position.clone(),quaternion:object.quaternion.clone(),scale:new THREE.Vector3(1,1,1)});
function registerBook(action,entry){
 entry.leaves=[];entry.restPosition=entry.object.position.clone();entry.restQuaternion=entry.object.quaternion.clone();entry.action=action;
 bookCatalog.set(action,entry);mark(entry.object,action);
 if(!document.querySelector(`[data-action="${action}"]`)){const button=document.createElement('button');button.dataset.action=action;button.textContent='翻开'+entry.title;$('#keyboard-access').appendChild(button);}
}
registerBook('book',{object:book,hinge:coverHinge,width:BW,height:BH,title:mainBookTitle,pageData:memoir.pages,toc:memoir.toc,baseZ:.0295,turnedZ:.048,localBounds:new THREE.Box3(new THREE.Vector3(-.023,-.345,-.023),new THREE.Vector3(.49,.345,.049)),location:'desk'});
for(const kind of ['certificate','classbook']){
 const spec=shelfData.reservedKeepsakes[kind],object=assets[5].getObjectByName(spec.root),certificate=kind==='certificate';
 object.position.fromArray(spec.position);object.quaternion.fromArray(spec.quaternion);object.updateMatrixWorld(true);
 const hinge=object.getObjectByName(certificate?'CertificateCoverHinge':'ClassBookCoverHinge');
 const width=certificate?.39:.42,height=certificate?.53:.563;
 const pageData=certificate?[]:[
  {type:'title',title:'给未来的留言',subtitle:'空白练习 · Guest Book'},
  {heading:'关于你',kicker:'留言册 · 留白页',blocks:[{label:'姓名与昵称',text:'____________________'},{label:'窗边的光',text:'____________________'}]},
  {heading:'想说的话',kicker:'留言册 · 留白页',blocks:[{label:'留给未来的一句话',text:'____________________'},{label:'一起记住的事情',text:'____________________'}]},
  {heading:'以后见',kicker:'留言册 · 留白页',blocks:[{label:'下一次见面',text:'____________________'},{label:'日期',text:'____________________'}]}
 ];
 registerBook('book:'+kind,{object,hinge,width,height,title:certificate?'纪念卡册':'留言册',pageData,toc:certificate?[]:pageData.map((p,i)=>({label:p.heading||p.title,page:i})),baseZ:.03185,turnedZ:-.0325,localBounds:boundsFrom(spec.localBounds),location:'shelf',note:certificate?'': '开源留言册样张，可替换为自己的文字。'});
}
for(const spec of shelfData.books){
 const object=assetObject(spec.root);if(!object)throw Error('Missing book: '+spec.root);
 const replacement=(shelfReplacement.books||[]).some(b=>b.root===spec.root);
 const identity=(replacement?null:identities.byRoot?.[spec.root])||{catalogLabel:spec.title||'示例读本',status:'example',print:{title:spec.title||'示例读本'}};if(!replacement)applyReadableBookPrint(THREE,object,spec,identity,renderer.capabilities.getMaxAnisotropy(),bookSources.byRoot?.[spec.root]);
 const content=textbookData.subjects[spec.root==='ShelfBook10'?'reflection':spec.content_subject]||textbookData.subjects.reflection;if(!content)throw Error('Missing content: '+spec.content_subject);
 const inner=object.getObjectByName(spec.innerLeft);
 const dossier=spec.root==='BinderRight03';
 const readingPage=resolveReadingPageLayout({width:spec.W,height:spec.H,readingPageBounds:spec.readingPageBounds});
 const rewritten=refinedStudy.byRoot[spec.root],pageData=dossier?yongwaiPages:paginateStudyBook(rewritten?.pages||content.pages,{aspect:readingPage.aspect});
 const toc=pageData.flatMap((p,i)=>dossier||i===0||p.section!==pageData[i-1].section?[{label:p.heading||p.title,page:i}]:[]);
 registerBook('textbook:'+spec.root,{object,hinge:object.getObjectByName(spec.hinge),width:spec.W,height:spec.H,title:dossier?'记忆房间 · 示例资料册':identity.catalogLabel,pageData,toc,baseZ:spec.paperTopZ+.00025,turnedZ:-spec.leftInnerZ+.00025,localBounds:boundsFrom(spec.localBounds),location:'shelf',spec,inner,source:dossier?null:bookSources.byRoot[spec.root]||{status:'unconfirmed'},note:dossier?'原创示例资料 · 点纸张可抽出查看':rewritten?`重新编写的学习页 · ${toc.length} 单元 · ${pageData.length} 页`:'原创示例读本 · 可替换文字与封面'});
}
const staticObstacles=shelfData.fixed_colliders.map(o=>makeOBB(new THREE.Vector3(...o.center),new THREE.Vector3(...o.half),new THREE.Quaternion(),o.name));
function collisionObstacles(){
 return [...staticObstacles,...[...bookCatalog.values()].map(e=>obbFromLocalBounds(e.localBounds,{position:e.restPosition,quaternion:e.restQuaternion},{id:e.object.name}))];
}
function activateBook(action){
 const entry=bookCatalog.get(action);activeBookAction=action;book=entry.object;coverHinge=entry.hinge;BW=entry.width;BH=entry.height;
 deskBookPos=entry.restPosition.clone();deskBookQuat=entry.restQuaternion.clone();
 if(!entry.leaves.length&&entry.pageData.length){
  entry.leaves=createLeaves({object:book,width:BW,height:BH,pageData:entry.pageData,title:entry.title,baseZ:entry.baseZ,turnedZ:entry.turnedZ,step:.00016,maxStackDepth:entry.spec?Math.max(.00005,entry.spec.leftInnerZ-entry.baseZ-.0001):.006,readingPageBounds:entry.spec?.readingPageBounds});
  for(const leaf of entry.leaves)leaf.group.visible=false;
  if(entry.inner){
   entry.savedInnerMaterial=entry.inner.material;entry.savedInnerGeometry=entry.inner.geometry;
   const geometry=entry.inner.geometry.clone();geometry.computeBoundingBox();
   const p=geometry.attributes.position,b=geometry.boundingBox,uv=new Float32Array(p.count*2),w=b.max.x-b.min.x,h=b.max.y-b.min.y;
   // The inside cover faces -Z and swings through 180 degrees. Its exported
   // mesh has no UVs; mapping in this orientation keeps the contents upright.
   for(let i=0;i<p.count;i++){uv[i*2]=(b.max.x-p.getX(i))/w;uv[i*2+1]=(b.max.y-p.getY(i))/h;}
   geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));entry.inner.geometry=geometry;
   const map=pageTexture({type:'contents',label:entry.source?'示例读本目录':'资料目录',items:entry.toc.map(t=>t.label)},0,entry.title,renderer.capabilities.getMaxAnisotropy(),w/h);map.flipY=false;
   entry.inner.material=new THREE.MeshPhysicalMaterial({map,roughness:.92,specularIntensity:.15,side:THREE.DoubleSide});
  }
 }
 pages.splice(0,pages.length,...entry.leaves);pageIndex=0;bookOpen=false;resetReadingFocus(entry);closeMobileReadingTOC();
 $('#toc-title').textContent=entry.title;$('#toc-note').textContent=entry.note||'';
 $('#toc-list').replaceChildren(...entry.toc.map(item=>{const li=document.createElement('li'),button=document.createElement('button');button.textContent=item.label;button.addEventListener('click',()=>jumpPage(item.page));li.append(button);return li;}));
 const sources=$('#book-source');sources.hidden=!entry.source;sources.replaceChildren();
 if(entry.source){
  const summary=document.createElement('summary');summary.textContent='示例内容说明';sources.append(summary);
  const source=entry.source,p=document.createElement('p');p.textContent=['本站内页：原创中性示例内容','封面与书脊：通用可读排版','你可以替换成自己拥有公开权利的内容。'].join('\n');sources.append(p);
  for(const link of source.links||[]){if(!/^https?:\/\//i.test(link.url||''))continue;const a=document.createElement('a');a.textContent=link.label;a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);}
 }
 $('#page-number').max=String(Math.max(1,entry.pageData.length));$('#page-number').value='1';
}
function releaseReadingPages(){const entry=bookCatalog.get(activeBookAction);disposeLeaves(entry.leaves);entry.leaves=[];pages.length=0;if(entry.savedInnerMaterial){entry.inner.material.map?.dispose();entry.inner.material.dispose();entry.inner.material=entry.savedInnerMaterial;entry.savedInnerMaterial=null;entry.inner.geometry.dispose();entry.inner.geometry=entry.savedInnerGeometry;entry.savedInnerGeometry=null;}}
function deform(p,t,grabY=0){needsRender=true;if(!readingPass.enabled)renderer.shadowMap.needsUpdate=true;bendPage(p,t,grabY);}

async function loadMap(){try{const data=await loadJSON('assets/china.json?v=20261007-overnight1');const c=mapTexture.image.getContext('2d');c.fillStyle='#7e8c6e';c.strokeStyle='#d1bd90';c.lineWidth=.8;for(const f of data.features){const polys=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];for(const poly of polys){c.beginPath();for(const ring of poly){ring.forEach(([lng,lat],i)=>{const x=55+(lng-73)*12.7,y=98+(54-lat)*11.7;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();}c.fill('evenodd');c.stroke();}}mapTexture.needsUpdate=true;}catch(e){console.warn('Map could not load');}}
await loadMap();
function eased(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function duration(seconds){return reduced?.12:seconds;}
function flyCamera(position,look,seconds=1.15,onEnd,{fov=camera.fov}={}){
 pendingOrbitView=null;scene.updateMatrixWorld(true);const from=constrainCameraPosition(camera.position);let to=constrainCameraPosition(position),route=cameraClearance.route(from,to);
 // A crowded endpoint may need a slightly wider shot. A failed route must
 // never run the successful entrance callback from an unrelated camera pose.
 if(!route.reachedTarget){
  const direction=to.clone().sub(look).normalize();
  for(const extra of [.18,.40,.75,1.25]){const candidate=constrainCameraPosition(to.clone().addScaledVector(direction,extra)),attempt=cameraClearance.route(from,candidate);if(attempt.reachedTarget){to=candidate;route=attempt;break;}}
 }
 if(!route.reachedTarget){camTween=null;busy=false;setTimeout(()=>closeCurrent(()=>{mode='view';currentAction='view';busy=false;transitioning=false;returningObject=false;queuedAction=null;caption('已停在安全位置，可以继续查看。');updateControls();}),0);return false;}
 camTween={from,to,route,fovFrom:camera.fov,fovTo:fov,lookFrom:currentLook.clone(),lookTo:look.clone(),time:0,d:duration(seconds),onEnd};busy=true;updateControls();return true;
}
flyCamera.getState=()=>({position:camera.position.clone(),look:currentLook.clone(),aspect:camera.aspect,fov:camera.fov});
const keyboardTerminals=[];electronics.traverse(o=>{if(o.name==='KeyboardUSBPlug'||o.name.startsWith('KeyboardUSBConnector'))keyboardTerminals.push(o);});
const keyboardCableParking=createInspectionCableParking({cables:[electronics.getObjectByName('KeyboardConnectedCable')],terminals:keyboardTerminals,onChange(){needsRender=true;renderer.shadowMap.needsUpdate=true;roomPass.invalidate();ambientOcclusion.invalidate();}});
const inspector=createObjectInspector({THREE,scene,assets,mark,flyCamera,caption,fixedResize:(object,anchor)=>planFixedInspectionResize({object,anchor,camera,clearance:cameraClearance}),onPrepare(name){if(name==='KeyboardRoot')keyboardCableParking.park();},onRestore(name){if(name==='KeyboardRoot')keyboardCableParking.restore();},onBusy(value){busy=value;updateControls();},onChange(){needsRender=true;if(!inspectionPass.enabled||busy)renderer.shadowMap.needsUpdate=true;}});
await inspector.ready;
try{resumePaper=await loadResumePaper(THREE,{anisotropy:renderer.capabilities.getMaxAnisotropy()});}catch(error){console.warn('Existing résumé is unavailable',error);}
desktop.setData({owner:'Memory Room',title:mainBookTitle,subtitle:'可探索的三维书桌',introduction:'翻阅一本书，查看两张图卡，或拿起桌上的项目说明页。这里展示的是可自由替换的原创示例内容。',photos:[{id:'paper-space',title:'纸上空间',note:'原创几何图卡 · 公开示例',url:'assets/cover-photo.jpg'},{id:'desk-composition',title:'桌面构图',note:'原创几何图卡 · 公开示例',url:'assets/my-desk.jpg'}],videos:[],resume:resumePaper?.document||null});
if(resumePaper){
 scene.add(resumePaper.root);inspector.registerSimple('ResumePaperRoot',resumePaper.title);
 collectibleViews.set('collectible:ResumePaperRoot',{object:resumePaper.root,label:resumePaper.title});
 paperReader=createPaperReading({THREE,camera,reduced,viewport:()=>({width:innerWidth,height:innerHeight,insets:{top:14,bottom:96,left:14,right:14}}),onBusy(value){busy=value;updateControls();},onChange(){needsRender=true;}});
 paperControls=document.createElement('div');paperControls.id='paper-controls';paperControls.hidden=true;
 paperReadButton=document.createElement('button');paperReadButton.type='button';paperReadButton.addEventListener('click',()=>{cancelGesture();if(paperReader.active)paperReader.inspect();else readResume();});paperControls.append(paperReadButton);$('#object-controls').prepend(paperControls);
}
function readResume(){
 if(!resumePaper||!paperReader||busy||transitioning||inspector.object!==resumePaper.root||paperReader.active)return false;
 const {width:w,height:h,thickness:t}=RESUME_PAPER;
 caption('');return paperReader.open(resumePaper.root,{min:[-w/2,-h/2,-t/2],max:[w/2,h/2,t/2+.0014]});
}
for(const [name,label] of [['HeadphonesRoot','头戴式耳机'],['GimbalRoot','手机稳定器'],['KeyboardRoot','机械键盘'],['MouseRoot','白色鼠标'],['RightLargeFrameRoot','桌边大相框'],['RightSmallHouseFrameRoot','桌边小相框'],['RightWallHouseFrameRoot','墙上的屋形相框'],['DisneyFoxCharmRoot','几何挂件']]){inspector.registerSimple(name,label);collectibleViews.set('collectible:'+name,{object:assetObject(name),label});}
const cabinet=createCabinetInteractions({scene,asset:assets[7],camera,mark,flyCamera,caption,onBusy(value){busy=value;updateControls();},onChange(){needsRender=true;if(!inspectionPass.enabled||busy)renderer.shadowMap.needsUpdate=true;}});await cabinet.ready;
for(const [action,label] of [...collectibleViews].map(([key,value])=>[key,value.label]).concat([
 ['detail:CabinetDoorHinge','打开左侧柜门'],['detail:FoldingFanRoot','展开折扇'],['detail:BlackInkstoneBoxRoot','打开砚台盒'],['detail:CabinetCamcorderRoot','查看旧摄像机'],['detail:CabinetCompactCameraRoot','查看小相机'],['detail:JordanBackpackRoot','查看双肩包'],['brush:Brush01','拿起毛笔写字'],['detail:CalligraphyScrollUnplacedRoot','查看墙上字画']])){if(!document.querySelector(`[data-action="${action}"]`)){const button=document.createElement('button');button.dataset.action=action;button.textContent=label;$('#keyboard-access').append(button);}}
function localPoint(group,x,y,z){return group.localToWorld(new THREE.Vector3(x,y,z));}
// Single-page mode keeps pageIndex as the count of turned physical leaves.
let readingFocusPreference=null;
function focusState(){return bookCatalog.get(activeBookAction)?.readingFocus;}
function singleReading(){return Boolean(mode==='book'&&bookOpen&&pages.length&&focusState()?.enabled);}
function resetReadingFocus(entry){
 entry.readingFocus={enabled:readingFocusPreference??innerWidth<600,page:0,zoom:1,panPixels:[0,0]};
}
function readingFocusViewport(){
 const control=$('#object-controls'),controls=control.hidden?null:control.getBoundingClientRect();
 const toc=$('#book-toc'),toggle=toc.hidden?null:$('#toc-toggle').getBoundingClientRect();
 // The expanded TOC is an intentional overlay; picking a page closes it on
 // small screens. Its toggle and the actual wrapped bottom toolbar are inset.
 return {width:innerWidth,height:innerHeight,insets:{
  top:toggle?Math.max(12,toggle.bottom+10):12,
  bottom:controls?Math.max(12,innerHeight-controls.top+10):20,
  left:0,right:0,
 }};
}
function readingFocusOptions(bounds=null){
 const state=focusState(),entry=bookCatalog.get(activeBookAction),address=pageAddress(state.page,entry.pageData.length),leaf=pages[address.leafIndex];
 return {bounds:bounds||flatPageBounds(address,leaf),
  camera:{position:camera.getWorldPosition(new THREE.Vector3()).toArray(),quaternion:camera.getWorldQuaternion(new THREE.Quaternion()).toArray(),fov:camera.getEffectiveFOV(),aspect:camera.aspect,near:camera.near},
  viewport:readingFocusViewport(),marginPx:14,zoom:state.zoom,panPixels:state.panPixels,
  frontMostLocalZ:Math.max(entry.spec?.coverZ||.049,...pages.map(p=>Math.max(p.baseZ,p.turnedZ))),
 };
}
function readingLocalPose(world){
 const position=new THREE.Vector3(...world.position),quaternion=new THREE.Quaternion(...world.quaternion);
 if(book.parent){book.parent.updateWorldMatrix(true,false);book.parent.worldToLocal(position);quaternion.premultiply(book.parent.getWorldQuaternion(new THREE.Quaternion()).invert());}
 return {position,quaternion};
}
function fullReadingPose(){
 const pose=readingLocalPose({position:bookDestination().toArray(),quaternion:camera.getWorldQuaternion(new THREE.Quaternion()).toArray()});
 if(readingRoute?.length){
  const entry=closingReadingPose(),forward=new THREE.Vector3(0,0,-1).applyQuaternion(entry.quaternion);
  // A narrow resize must not refit the spread farther into the room than
  // its already reached entry stage. Lateral cropping is preferable here.
  if(pose.position.clone().sub(entry.position).dot(forward)>0)return entry;
 }
 return pose;
}
function closingReadingPose(){
 // Reuse the entry route's already reached open stage. Re-fitting a spread
 // after a narrow resize can push it behind the room wall; the camera and
 // original return route stay fixed while pages reset and the cover closes.
 const end=readingRoute.at(-1),quaternion=end.quaternion.clone();
 const position=end.position.clone().addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(quaternion),BW/2);
 return {position,quaternion};
}
function placeReadingPose(pose){book.position.copy(pose.position);book.quaternion.copy(pose.quaternion);book.updateWorldMatrix(true,true);needsRender=true;}
function animateReadingPose(pose,done,seconds=.24){
 busy=true;bookTween={from:book.position.clone(),to:pose.position,qFrom:book.quaternion.clone(),qTo:pose.quaternion,time:0,d:duration(seconds),arc:0,readingOnly:true,onEnd:done};needsRender=true;updateControls();
}
function acceptFocusFit(fit){const state=focusState();state.zoom=fit.effectiveZoom;state.panPixels=fit.panPixels;return readingLocalPose(fit);}
function fitReadingFocus(animated=false,done){
 if(!singleReading()){done?.();return;}
 const pose=acceptFocusFit(fitPageFocus(readingFocusOptions()));
 if(animated)animateReadingPose(pose,()=>{busy=false;updateControls();done?.();});
 else {placeReadingPose(pose);done?.();}
}
function closeMobileReadingTOC(){if(innerWidth<1100){$('#toc-panel').hidden=true;$('#toc-toggle').setAttribute('aria-expanded','false');}}
function settleReadingSpread(target){
 pageIndex=target;for(const p of pages){const t=p.index<target?1:0;if(p.group.visible)deform(p,t);else p.t=t;}updateReadingWindow();
}
function finishFocusedPage(page){
 const state=focusState();state.page=page;state.panPixels=[0,0];
 const fit=fitPageFocus(readingFocusOptions());
 state.panPixels=[0,fit.panLimits[1]];
 fitReadingFocus(true);
}
function seekFocusedPage(page){
 if(archiveSheet.active){archiveSheet.close();return;}
 const entry=bookCatalog.get(activeBookAction);
 if(!singleReading()||busy||!Number.isInteger(page)||page<0||page>=entry.pageData.length)return;
 const plan=planPageFocus(focusState().page,page,entry.pageData.length);
 closeMobileReadingTOC();
 // A TOC target can be the opposite side of the SAME spread. Never use the
 // old spread-only early-return here; same-page seeks intentionally re-centre.
 if(plan.to.spreadIndex===pageIndex){finishFocusedPage(page);return;}
 const direction=plan.to.spreadIndex>pageIndex?1:-1,idx=direction>0?pageIndex:pageIndex-1,leaf=pages[idx];
 if(!leaf)return;
 const envelope=openSpreadTurnBounds({...leaf,coverZ:entry.spec?.coverZ||.049});
 envelope.min[0]=Math.min(envelope.min[0],-BW-.018);envelope.max[0]=Math.max(envelope.max[0],BW+.018);
 envelope.min[1]=Math.min(envelope.min[1],-BH/2-.012);envelope.max[1]=Math.max(envelope.max[1],BH/2+.012);
 // Keep the selected-page stage during a phone turn; the opposite page may
 // extend past the side of the screen. The swept sheet still clears the lens.
 const fit=fitPageFocus({...readingFocusOptions(),zoom:1,panPixels:[0,0],frontMostLocalZ:envelope.max[2]});
 animateReadingPose(readingLocalPose(fit),()=>{
  // Like canonical chapter jumps, a distant TOC target makes one visible
  // real turn and then settles the other leaves; no minute-long queue.
  pageTween={p:leaf,from:leaf.t,to:direction>0?1:0,time:0,d:duration(Math.abs(plan.to.spreadIndex-pageIndex)>1?.48:.72),onEnd:()=>{
   settleReadingSpread(plan.to.spreadIndex);finishFocusedPage(page);
  }};needsRender=true;updateControls();
 },.20);
}
function stepFocusedPage(direction){
 const state=focusState(),entry=bookCatalog.get(activeBookAction);
 const plan=stepPageFocus(state.page,direction,entry.pageData.length);
 if(plan.kind!=='none')seekFocusedPage(plan.to.page);
}
function toggleReadingLayout(){
 if(mode!=='book'||!bookOpen||!pages.length||busy||archiveSheet.active)return;
 cancelGesture();
 const state=focusState(),entry=bookCatalog.get(activeBookAction);
 readingFocusPreference=!state.enabled;state.enabled=readingFocusPreference;
 state.zoom=1;state.panPixels=[0,0];closeMobileReadingTOC();
 if(state.enabled){state.page=focusFromSpread(pageIndex,entry.pageData.length,state.page);settleReadingSpread(pageAddress(state.page,entry.pageData.length).spreadIndex);updateControls();fitReadingFocus(true);}
 else animateReadingPose(fullReadingPose(),()=>{captureInspectionPose(book);busy=false;updateControls();});
}
function panReadingFocus(dx,dy){
 if(!singleReading()||archiveSheet.active||busy)return false;
 placeReadingPose(acceptFocusFit(panPageFocus(readingFocusOptions(),dx,dy)));return true;
}
function zoomReadingFocus(delta){
 if(!singleReading()||archiveSheet.active)return false;
 if(busy||transitioning)return true;
 placeReadingPose(acceptFocusFit(zoomPageFocus(readingFocusOptions(),delta)));return true;
}
function refitReadingFocusPolicy(){
 const state=focusState(),entry=bookCatalog.get(activeBookAction);
 if(!state||!entry.pageData.length)return false;
 if(readingFocusPreference===null)state.enabled=innerWidth<600;
 if(!state.enabled)return false;
 state.page=focusFromSpread(pageIndex,entry.pageData.length,state.page);
 settleReadingSpread(pageAddress(state.page,entry.pageData.length).spreadIndex);
 fitReadingFocus();return true;
}

function updateControls(){
 if(paperControls){paperControls.hidden=inspector.object!==resumePaper?.root;paperReadButton.textContent=paperReader.active?'旋转检视':'阅读说明页';paperReadButton.disabled=busy;paperReadButton.setAttribute('aria-pressed',String(paperReader.active));}
 if(pages.length&&!pageTween&&!pageResetTween)updateReadingWindow();
 const active=mode!=='home';$('#object-controls').hidden=!active;$('#book-controls').hidden=mode!=='book'||!bookOpen||pages.length===0||archiveSheet.active;
 const total=bookCatalog.get(activeBookAction)?.pageData.length||0,focus=singleReading(),leftPage=focus?focusState().page+1:Math.min(total,Math.max(1,pageIndex*2)),rightPage=focus?leftPage:Math.min(total,pageIndex*2+1);
 $('#back').textContent=archiveSheet.active?'放回文件袋':['book','bookInspect'].includes(mode)?'放回原位':inspector.active||cabinet.object?'放回物品':'回到书桌';$('#page-state').textContent=`${leftPage===rightPage?leftPage:leftPage+'–'+rightPage} / ${total}`;
 $('#prev').disabled=busy||(focus?focusState().page===0:pageIndex===0);$('#next').disabled=busy||(focus?focusState().page>=total-1:pageIndex>=pages.length);$('#back').disabled=false;
 const layout=$('#reading-layout');layout.disabled=busy;layout.textContent=focus?'整本':'单页';layout.setAttribute('aria-pressed',String(focus));layout.setAttribute('aria-label',focus?'切回整本展开':'聚焦单页阅读');document.body.classList.toggle('single-page-reading',focus);
 if(document.activeElement!==$('#page-number'))$('#page-number').value=String(focus?focusState().page+1:Math.max(1,rightPage));
 $('#book-toc').hidden=mode!=='book'||!bookOpen||!bookCatalog.get(activeBookAction)?.toc.length||archiveSheet.active;
 archiveControls.hidden=!archiveSheet.active;archiveDragMode.disabled=busy;archiveDragMode.textContent=archiveSheet.interaction==='read'?'移动阅读':'旋转检视';archiveDragMode.setAttribute('aria-label',archiveSheet.interaction==='read'?'当前移动阅读，切换为旋转检视':'当前旋转检视，切换为移动阅读');for(const b of archiveControls.querySelectorAll('[data-text-mode]')){b.hidden=!archiveSheet.hasText;b.disabled=busy;b.setAttribute('aria-pressed',String((b.dataset.textMode==='true')===archiveSheet.textMode));}
 const replay=$('#knife-inspect');if(replay){replay.hidden=!toys.supportsInspection||contentId(inspector.active)!=='knife'||!['displayed','inspecting'].includes(toys.getState().knife);replay.disabled=busy;}
 document.body.classList.toggle('reading',mode==='book');
 $('#toc-list').querySelectorAll('button').forEach((b,i)=>{b.disabled=busy;b.classList.toggle('current',focus?i===bookCatalog.get(activeBookAction).toc.findLastIndex(t=>t.page<=focusState().page):Math.floor((bookCatalog.get(activeBookAction).toc[i].page+1)/2)===pageIndex);});
}
function caption(text){$('#object-caption').textContent=text;$('#object-caption').hidden=!text;}
function updateReadingWindow(){
 // A closed cover conceals the sheets. Their physical spacing is separately
 // bounded by the real cover thickness, even for a long digital edition.
 if(mode==='book'&&Math.abs(coverHinge.rotation.y)>.015)syncLeafWindow(pages,pageIndex,{moving:pageTween?[pageTween.p.index]:[]});
 else for(const leaf of pages)leaf.group.visible=false;
}
function bookDestination(){
 const freeWidth=innerWidth>=1100?.76:.91;
 const fit=Math.max((BH*1.40)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))),BW*2.13/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*freeWidth));
 const p=camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(fit));
 if(innerWidth>=1100)p.addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),-BW*.27);
 return p;
}
function animateBookRoute(route,onEnd){
 let index=1;
 const next=()=>{if(index>=route.length){onEnd?.();return;}const a=route[index-1],b=route[index++];bookTween={from:a.position,to:b.position,qFrom:a.quaternion,qTo:b.quaternion,time:0,d:duration(index===2?.65:.58),arc:0,onEnd:next};};next();
}
function planBookRoute(target){
 const entry=bookCatalog.get(activeBookAction),home={position:entry.restPosition.clone(),quaternion:entry.restQuaternion.clone(),scale:new THREE.Vector3(1,1,1)};
 const stage={position:home.position.clone(),quaternion:home.quaternion.clone(),scale:home.scale};
 const radius=Math.max(entry.localBounds.min.length(),entry.localBounds.max.length());
 const exit=[];
 if(entry.location==='shelf')stage.position.z=Math.max(.62,radius-.355+.035);
 else{
  // Clear the bookstand's retaining lip before coming forward; only turn the
  // cover once its entire volume is clear of the support and desk objects.
  const lifted={position:home.position.clone().add(new THREE.Vector3(0,.020,0)),quaternion:home.quaternion.clone(),scale:home.scale};
  const forward={position:lifted.position.clone().add(new THREE.Vector3(0,0,.18)),quaternion:home.quaternion.clone(),scale:home.scale};
  exit.push(lifted,forward);stage.position.copy(forward.position).add(new THREE.Vector3(0,.20,0));
 }
 const turned={position:stage.position.clone(),quaternion:camera.quaternion.clone(),scale:home.scale};
 const end={position:target.clone(),quaternion:camera.quaternion.clone(),scale:home.scale};
 const route=[home,...exit,stage,turned,end],result=checkOBBPath(entry.localBounds,route,collisionObstacles(),{id:book.name,maxPointStep:.002,maxAngleStep:Math.PI/120});
 return {route,result};
}
function beginBook(reframed=false){
 const origin=mode;const target=bookDestination(),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),closedTarget=target.clone().addScaledVector(right,-BW/2);
 const planned=planBookRoute(closedTarget);
 if(!planned.result.clear){
  if(!reframed){
   const entry=bookCatalog.get(activeBookAction),center=new THREE.Box3().setFromObject(book).getCenter(new THREE.Vector3());
   const fit=Math.max(BH*1.4/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))),BW*2.13/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*(innerWidth>=1100?.76:.91)));
   center.z=entry.location==='shelf'?1.02:1.1;center.y=Math.max(1.6,center.y);
   flyCamera(center.clone().add(new THREE.Vector3(0,0,fit)),center,.7,()=>{busy=false;beginBook(true);});return;
  }
  caption('取书路线受到遮挡，请换一个角度。');console.warn('Book path blocked',book.name,planned.result.firstCollision?.obstacleId);releaseReadingPages();currentAction=mode;viewHistory.pop();return;
 }
 readingOrigin=origin;readingRoute=planned.route;mode='bookInspect';busy=true;caption('');updateControls();
 animateBookRoute(readingRoute,()=>{bookInspectionPose=captureInspectionPose(book);busy=false;caption('再点封面，翻开这本书');updateControls();});
}
function openInspectedBook(){
 if(mode!=='bookInspect'||busy)return;busy=true;caption('');const end=readingRoute.at(-1);
 bookTween={from:book.position.clone(),to:end.position.clone(),qFrom:book.quaternion.clone(),qTo:end.quaternion.clone(),time:0,d:duration(.32),arc:0,onEnd:()=>{mode='book';coverTween={from:0,to:-Math.PI,time:0,d:duration(.85),posFrom:book.position.clone(),posTo:fullReadingPose().position,onEnd:()=>{bookOpen=true;busy=false;updateControls();if(singleReading())fitReadingFocus(true);else captureInspectionPose(book);}};updateControls();}};updateControls();
}
function turnPage(direction){if(mode!=='book'||busy||!bookOpen||archiveSheet.active)return;cancelGesture();if(singleReading()){stepFocusedPage(direction);return;}const idx=direction>0?pageIndex:pageIndex-1;if(idx<0||idx>=pages.length)return;busy=true;pageTween={p:pages[idx],from:pages[idx].t,to:direction>0?1:0,time:0,d:duration(.9),onEnd:()=>{pageIndex+=direction;busy=false;updateControls();}};updateControls();}
function jumpPage(page){
 if(archiveSheet.active){archiveSheet.close();return;}if(busy||!bookOpen)return;cancelGesture();if(singleReading()){seekFocusedPage(page);return;}const target=Math.min(pages.length,Math.floor((page+1)/2));if(target===pageIndex)return;
 // Contents navigation is a single physical turn followed by a direct seek;
 // chapter 20 must never enqueue a minute of page-flipping animations.
 busy=true;const direction=target>pageIndex?1:-1,idx=direction>0?pageIndex:pageIndex-1;
 pageTween={p:pages[idx],from:pages[idx].t,to:direction>0?1:0,time:0,d:duration(.48),onEnd:()=>{
  pageIndex=target;for(const p of pages){const t=p.index<target?1:0;if(p.group.visible)deform(p,t);else p.t=t;}
  busy=false;updateControls();
 }};updateControls();
}
function closeBook(done){
 const wasClosed=mode==='bookInspect',restoreSpread=singleReading();busy=true;caption('');
 if(wasClosed){bookOpen=false;updateControls();const end=readingRoute.at(-1);bookTween={from:book.position.clone(),to:end.position.clone(),qFrom:book.quaternion.clone(),qTo:end.quaternion.clone(),time:0,d:duration(.30),arc:0,onEnd:()=>animateBookRoute([...readingRoute].reverse(),()=>{mode=readingOrigin;busy=false;bookInspectionPose=null;releaseReadingPages();updateControls();done?.();})};return;}
 const close=()=>{coverTween={from:coverHinge.rotation.y,to:0,time:0,d:duration(.7),posFrom:book.position.clone(),posTo:readingRoute.at(-1).position,onEnd:()=>{pageIndex=0;animateBookRoute([...readingRoute].reverse(),()=>{mode=readingOrigin;busy=false;releaseReadingPages();updateControls();done?.();});}};};
 const resetAndClose=()=>{bookOpen=false;updateControls();if(pageIndex>0)pageResetTween={from:pages.map(p=>p.t),time:0,d:duration(.6),onEnd:close};else close();};
 // Restore the original complete-open pose before resetting pages or folding
 // the cover. Never write a magnified single-page pose into the rest route.
 if(restoreSpread)animateReadingPose(closingReadingPose(),resetAndClose,.28);else resetAndClose();
}

function closeCurrent(done,{keepCabinet=false}={}){
 desktop.setActive(false);caption('');
 const finishCabinet=()=>{
  if(!keepCabinet&&cabinet.active==='detail:CabinetDoorHinge')cabinet.close(done,{restoreView:false});
  else done();
 };
 const finishObject=()=>{
  if(cabinet.active&&cabinet.active!=='detail:CabinetDoorHinge')cabinet.close(finishCabinet,{restoreView:false});
  else finishCabinet();
 };
 if(drawing.active){drawing.close();drawingEntryView=null;mode=readingOrigin;}
 if(mode==='book'||mode==='bookInspect'){closeBook(finishObject);return;}
 if(inspector.active){closeInspector(finishObject,{restoreView:false});return;}
 finishObject();
}
function snapshotView(){return {...flyCamera.getState(),mode:['book','bookInspect','drawing'].includes(mode)||inspector.active?'view':mode};}
function cancelSurfaceCapture(){
 if(desktopCapture)desktop.handlePointer({type:'cancel'});
 if(drawingCapture)drawing.pointer('cancel');
 desktopCapture=false;drawingCapture=false;lastScreenUV=null;
 const ids=new Set([...desktopTouches.keys(),activePointerId]);desktopTouches.clear();desktopTouchMode=null;activePointerId=null;
 for(const id of ids)if(id!==null&&renderer.domElement.hasPointerCapture(id))renderer.domElement.releasePointerCapture(id);
}
function returnHome(forceDesk=false){if(drag?.page&&drag.moved)releasePageDrag(true);go(forceDesk?'__desk__':'__back__');}
function go(action){
 if(contextLost||introActive)return;
 if(archiveSheet.active){archiveSheet.close();return;}
 if(returningObject)return;
 const inspecting=['book','bookInspect','drawing'].includes(mode)||Boolean(inspector.active)||Boolean(cabinet.object);
 // Outside clicks are consumed by putting the current object away. A new
 // object always requires a separate intentional click after that completes.
 if(inspecting&&action!==currentAction&&action!=='__back__')action='__back__';
 if(drag?.page&&drag.moved)releasePageDrag(true);else drag=null;
 cancelGesture();
 if(busy||transitioning){if(action!==currentAction)queuedAction=action;return;}
 const back=action==='__back__',desk=action==='__desk__';
 if(!back&&!desk&&action===currentAction){if(mode==='bookInspect')openInspectedBook();else if(mode==='book')turnPage(1);else if(action==='collectible:ResumePaperRoot')readResume();else if(action==='detail:CabinetDoorHinge')cabinet.open(action);return;}
 if(mode==='home')lastDeskView=copyView({...flyCamera.getState(),mode:'home'});
 const incoming=copyView(snapshotView());
 const restore=(back||desk)?copyView(desk?lastDeskView:(viewHistory.pop()||lastDeskView)):null;
 returningObject=Boolean(restore&&inspecting);
 if(desk)viewHistory.length=0;
 if(!restore)viewHistory.push(incoming);
 transitioning=true;drag=null;
 const keepCabinet=!restore&&(cabinet.canOpen(action)||action.startsWith('brush:'));
 closeCurrent(()=>{
  transitioning=false;busy=false;
  if(restore){
   mode=restore.mode;currentAction=mode;updateControls();
   const finished=()=>{busy=false;returningObject=false;if(mode==='computer'||mode==='keyboard')desktop.setActive(true);updateControls();};
   if(camera.position.distanceTo(restore.position)<.0001&&currentLook.distanceTo(restore.look)<.0001&&Math.abs(camera.fov-restore.fov)<.0001)finished();
   else flyCamera(restore.position,restore.look,.8,finished,{fov:restore.fov});
  }else{currentAction=action;enterView(action);}
 },{keepCabinet});
}
$('#page-jump').addEventListener('submit',e=>{e.preventDefault();const page=Number($('#page-number').value);if(Number.isInteger(page)&&page>=1&&page<=bookCatalog.get(activeBookAction).pageData.length)jumpPage(page-1);});
$('#toc-toggle').addEventListener('click',()=>{const panel=$('#toc-panel');panel.hidden=!panel.hidden;$('#toc-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
if(innerWidth<1100){$('#toc-panel').hidden=true;$('#toc-toggle').setAttribute('aria-expanded','false');}
function enterView(action){
 // Normalize the lens in place before computing a close-up fit.
 if(Math.abs(camera.fov-PRESET_FOV)>.0001){flyCamera(camera.position.clone(),currentLook.clone(),.22,()=>{busy=false;enterView(action);},{fov:PRESET_FOV});return;}
 if(bookCatalog.has(action)){
  const entry=bookCatalog.get(action),object=entry.object;
  if(!object){activateBook(action);beginBook();return;}
  const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  const near=center.clone();near.y=Math.max(1.55,near.y+.10);near.z=Math.max(2.1,center.z+1.75);mode='view';
  flyCamera(near,center,.85,()=>{busy=false;viewHistory[viewHistory.length-1]=copyView({...flyCamera.getState(),mode:'view'});activateBook(action);beginBook();});return;
 }
desktop.setActive(false);
if(action==='collectible:McDonaldsDoraemonRoot')toys.playToy({sound:true});
if(action.startsWith('brush:')){cabinet.ensureOpen(()=>{readingOrigin='cabinet';mode='drawing';drawingEntryView=flyCamera.getState();const target=new THREE.Vector3(-.83,2.25,.62),dist=Math.max(1.2,1.15/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));flyCamera(target.clone().add(new THREE.Vector3(0,0,dist)),target,.7,()=>{busy=false;drawing.open(assets.map(a=>a.getObjectByName(action.slice(6))).find(Boolean));updateControls();});});return;}
if(cabinet.canOpen(action)){mode='cabinet';updateControls();cabinet.open(action);return;}
if(inspector.canOpen(action)){inspectionOrigin=mode;mode=action;updateControls();inspector.open(action,ok=>{const item=contentId(action);if(ok&&item){busy=true;updateControls();toys.show(item,{containerOpen:true});}});return;}
caption('');mode=action;updateControls();const portrait=camera.aspect<.85;
if(collectibleViews.has(action)){
 const {object,label}=collectibleViews.get(action),bounds=new THREE.Box3().setFromObject(object),target=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 const frame=Math.max(size.y,size.x/camera.aspect),distance=Math.max(.55,frame/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.34+size.z*.5);
 flyCamera(target.clone().add(new THREE.Vector3(0,size.y*.045,distance)),target,1.05,()=>{busy=false;caption(label);updateControls();});
}
else if(action==='computer'||action==='keyboard'){const target=screenCenter(),size=activeScreen.geometry.boundingBox.getSize(new THREE.Vector3());const direction=new THREE.Vector3(0,0,1).transformDirection(activeScreen.matrixWorld);const distance=Math.max(.58,size.y*1.35/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))),size.x*1.18/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));flyCamera(target.clone().addScaledVector(direction,distance),target,1.1,()=>{busy=false;desktop.setActive(true);caption('');updateControls();});}
else if(action==='wall'){const target=localPoint(wallBoard,0,0,.12),normal=new THREE.Vector3(0,0,1).transformDirection(wallBoard.matrixWorld);const dist=portrait?3.9:2.35;flyCamera(target.clone().addScaledVector(normal,dist),target,1.25,()=>{busy=false;updateControls();});}
else if(action.startsWith('photo:')){const info=photos.find(p=>'photo:'+p.name===action);selectedPhoto=info;const target=info.group.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(0,0,1).transformDirection(wallBoard.matrixWorld);flyCamera(target.clone().addScaledVector(normal,portrait?.9:.75),target,.8,()=>{busy=false;caption(info.name);updateControls();});}
else{let target=action==='frames'?new THREE.Box3().setFromObject(deskFrames).getCenter(new THREE.Vector3()):action==='deskObjects'?new THREE.Vector3(-1.02,1.4,.01):action==='souvenirs'?new THREE.Vector3(.64,3.32,-.35):new THREE.Vector3(0,2.37,-.36);flyCamera(target.clone().add(new THREE.Vector3(0,.08,portrait?1.8:1.25)),target,1.0,()=>{busy=false;caption('');updateControls();});}}
let pickRoots=[],pickRootCount=-1;
function findHit(e){
 if(archiveSheet.active){pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObject(archiveSheet.object,true)[0];return hit?{hit,action:'__archive_sheet__'}:null;}
 if(pickRootCount!==interactive.length){const set=new Set(interactive);pickRoots=interactive.filter(o=>{for(let p=o.parent;p;p=p.parent)if(set.has(p))return false;return true;});pickRootCount=interactive.length;}
 pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);
 const hits=ray.intersectObjects(pickRoots,true);
 for(const h of hits){if(h.object.userData.pickThrough)continue;let ancestor=h.object,visible=true;while(ancestor){if(!ancestor.visible){visible=false;break;}ancestor=ancestor.parent;}if(!visible)continue;let o=h.object;while(o&&!o.userData.action)o=o.parent;if(o)return{hit:h,action:o.userData.action};}
 return null;
}
// Only the latest manual bend is visible in a frame. Flush on release too,
// so a final pointer sample still controls commit even before the next RAF.
function flushPageDrag(){if(!drag?.page||drag.pendingT===undefined)return;const t=drag.pendingT;delete drag.pendingT;deform(drag.page,t,drag.grabY);}
function releasePageDrag(cancel=false){flushPageDrag();const a=drag;drag=null;if(!a?.page)return;const commit=!cancel&&(a.direction>0?a.page.t>.38:a.page.t<.62),goal=commit?(a.direction>0?1:0):a.startT;busy=true;pageTween={p:a.page,from:a.page.t,to:goal,time:0,d:duration(.42),onEnd:()=>{if(commit)pageIndex+=a.direction;busy=false;updateControls();}};}
function routeDesktopTouch(type,e){
 if(e.pointerType!=='touch')return false;
 const owns=desktopTouches.has(e.pointerId);
 if(type==='down'){
  if(!desktopCapture||!desktopTouches.size)return false;
  if(owns||desktopTouchMode||desktopTouches.size>=2)return true;
  // The original press is already owned by the PC. Never hand its second contact to room pinch.
  desktopTouches.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY});
  touchPoints.clear();pinchDistance=null;pinchActive=false;drag=null;
  const points=[];for(const p of desktopTouches.values()){
   pointer.set(p.clientX/innerWidth*2-1,-p.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);
   const hit=ray.intersectObject(activeScreen,false)[0];if(hit?.object===activeScreen&&hit.uv)points.push({x:hit.uv.x,y:hit.uv.y});
  }
  const response=desktop.handlePointer({type:'pinchstart',points});desktopTouchMode=response?.pinching?'pinch':'blocked';
  renderer.domElement.setPointerCapture(e.pointerId);renderer.domElement.style.cursor=response?.cursor||'default';return true;
 }
 if(!desktopTouchMode)return false;
 if(!owns)return true;
 if(type==='move'){
  desktopTouches.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY});
  if(desktopTouchMode==='pinch'){
   const points=[];for(const p of desktopTouches.values()){
    pointer.set(p.clientX/innerWidth*2-1,-p.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);
    const hit=ray.intersectObject(activeScreen,false)[0];if(hit?.object===activeScreen&&hit.uv)points.push({x:hit.uv.x,y:hit.uv.y});
   }
   // Missing real screen intersections cancel rather than reusing lastScreenUV.
   const response=desktop.handlePointer({type:points.length===2?'pinchmove':'pinchcancel',points});
   if(!response?.pinching)desktopTouchMode='blocked';renderer.domElement.style.cursor=response?.cursor||'default';
  }
  return true;
 }
 if(type==='up'){
  desktop.handlePointer({type:'pinchend'});desktopTouchMode='blocked';desktopTouches.delete(e.pointerId);
  activePointerId=desktopTouches.keys().next().value??null;
  if(!desktopTouches.size){desktopTouchMode=null;desktopCapture=false;lastScreenUV=null;renderer.domElement.style.cursor='default';}
  // The surviving contact remains absorbed; it must lift before a new single-finger operation.
  return true;
 }
 return false;
}
function routeSurfacePointer(type,e){
 if(drawing.active){
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);
  const hit=ray.intersectObject(drawing.paper)[0];
  if(type==='down'&&hit){drawingCapture=true;renderer.domElement.setPointerCapture(e.pointerId);drawing.pointer(type,hit.uv,e.pressure,e.buttons);return true;}
  if(drawingCapture){
   const samples=type==='move'?e.getCoalescedEvents?.():null;
   if(samples?.length>1){for(const sample of samples){pointer.set(sample.clientX/innerWidth*2-1,-sample.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);drawing.pointer(type,ray.intersectObject(drawing.paper)[0]?.uv,sample.pressure,sample.buttons);}}
   else drawing.pointer(type,hit?.uv,e.pressure,e.buttons);
   if(type==='up'||type==='cancel')drawingCapture=false;return true;
  }
  if(type==='move'&&hit){drawing.pointer(type,hit.uv,e.pressure,e.buttons);renderer.domElement.style.cursor='none';return true;}
  return false;
 }
 if((mode==='computer'||mode==='keyboard')&&!busy){
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);
  const hit=ray.intersectObject(activeScreen,false)[0];
  if(hit?.object===activeScreen&&hit.uv)lastScreenUV=hit.uv;
  if(hit?.object===activeScreen||desktopCapture){
   if(type==='down'){desktopCapture=true;renderer.domElement.setPointerCapture(e.pointerId);}
   if(e.pointerType==='touch'&&desktopCapture&&(type==='down'||type==='move'))desktopTouches.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY});
   // A captured release outside the screen cancels; its last valid UV is not a click target.
   const surfaceType=desktopCapture&&type==='up'&&hit?.object!==activeScreen?'cancel':type;
   const response=lastScreenUV?desktop.handlePointer({type:surfaceType,x:lastScreenUV.x,y:lastScreenUV.y,button:e.button,pointerType:e.pointerType,wheelY:type==='wheel'?e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1):0}):null;
   renderer.domElement.style.cursor=response?.cursor||'default';
   if(type==='up'||type==='cancel')desktopCapture=false;return true;
  }
  desktop.handlePointer({type:'leave'});
 }
 return false;
}
function inspectedObject(){return archiveSheet.object||(['book','bookInspect'].includes(mode)?book:(contentId(inspector.active)&&toys.getState()[contentId(inspector.active)]==='displayed'?toys.getObject(contentId(inspector.active)):inspector.object)||cabinet.object);}
function zoomObject(delta){if(paperReader?.active)return paperReader.zoom(delta);if(zoomReadingFocus(delta))return true;const object=inspectedObject();if(!object)return false;if(busy||transitioning)return true;if(archiveSheet.active){archiveSheet.zoom(delta);return true;}magnifyInspectionObject(object,camera,delta);needsRender=true;return true;}
function flushRoomOrbit(){if(pendingOrbitView&&!busy&&!transitioning&&!inspectedObject()){camera.position.copy(cameraClearance.move(camera.position,pendingOrbitView.position));currentLook.copy(pendingOrbitView.look);camera.lookAt(currentLook);pendingOrbitView=null;roomPass.invalidate();ambientOcclusion.invalidate();needsRender=true;}}
function zoomRoom(delta){
 if(busy||transitioning||drawing.active||inspectedObject())return false;
 flushRoomOrbit();
 const direction=camera.position.clone().sub(currentLook),distance=direction.length(),next=THREE.MathUtils.clamp(distance*Math.exp(THREE.MathUtils.clamp(delta,-300,300)*.0011),.38,7.5);
 const destination=constrainCameraPosition(currentLook.clone().addScaledVector(direction.normalize(),next));
 camera.position.copy(cameraClearance.move(camera.position,destination));
 if(drag){drag.position.copy(camera.position);drag.look.copy(currentLook);drag.x=drag.lastX??drag.x;drag.y=drag.lastY??drag.y;drag.moved=true;}
 camera.lookAt(currentLook);roomPass.invalidate();ambientOcclusion.invalidate();needsRender=true;return true;
}
const touchPoints=new Map();let pinchDistance=null,pinchActive=false;
function updatePinch(e){if(e.pointerType!=='touch')return false;touchPoints.set(e.pointerId,new THREE.Vector2(e.clientX,e.clientY));if(touchPoints.size!==2||drawing.active)return false;const [a,b]=[...touchPoints.values()],distance=a.distanceTo(b);if(pinchDistance!==null&&distance>1){const delta=Math.log(pinchDistance/distance)/.0013;zoomObject(delta)||zoomRoom(delta);}pinchDistance=distance;pinchActive=true;drag=null;return true;}
renderer.domElement.addEventListener('wheel',e=>{if(contextLost){e.preventDefault();return;}const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);if(routeSurfacePointer('wheel',e)||zoomObject(delta)||zoomRoom(delta))e.preventDefault();},{passive:false});
renderer.domElement.addEventListener('pointerdown',e=>{
 // A second contact must not discard an in-progress page or drawing stroke.
 if(contextLost||busy||transitioning)return;
 if(routeDesktopTouch('down',e))return;
 if(activePointerId!==null&&e.pointerId!==activePointerId){
  if(drawing.active||drawingCapture||desktopCapture||e.pointerType!=='touch'||!touchPoints.has(activePointerId)||touchPoints.size>=2)return;
 }
 if(updatePinch(e)){renderer.domElement.setPointerCapture(e.pointerId);return;}
 if(e.button!==0)return;activePointerId=e.pointerId;if(!busy&&!transitioning&&routeSurfacePointer('down',e))return;
 const result=findHit(e);drag={x:e.clientX,y:e.clientY,time:performance.now(),position:camera.position.clone(),look:currentLook.clone(),action:result?.action,moved:false};
 renderer.domElement.setPointerCapture(e.pointerId);
 if(singleReading()&&!archiveSheet.active){drag.readingPan=true;return;}
 if(!archiveSheet.active&&mode==='book'&&bookOpen&&!busy&&result?.action===activeBookAction){
  const local=book.worldToLocal(result.hit.point.clone()),direction=local.x<0?-1:1,idx=direction>0?pageIndex:pageIndex-1;
  if(idx>=0&&idx<pages.length){const leaf=pages[idx],physical=Boolean(bookCatalog.get(activeBookAction)?.spec?.readingPageBounds),a=physical?(leaf.bindingInsetX||0):0,pageY=physical?(leaf.centerY||0):0,left=localPoint(book,a,pageY,.05).project(camera),right=localPoint(book,a+(physical?leaf.width:BW),pageY,.05).project(camera);Object.assign(drag,{page:leaf,grabY:THREE.MathUtils.clamp((local.y-pageY)/(physical?leaf.height:BH)*2,-1,1),direction,startT:pages[idx].t,width:Math.max(50,Math.abs(right.x-left.x)*innerWidth/2)});}
 }
});
renderer.domElement.addEventListener('pointermove',e=>{
 if(routeDesktopTouch('move',e))return;
 if(e.pointerType==='touch'){
  if(!touchPoints.has(e.pointerId))return;
  if(updatePinch(e)||pinchActive)return;
 }
 if(activePointerId!==null&&e.pointerId!==activePointerId)return;
 if(drawing.active)profiler.input(e.timeStamp);
 if(!drag&&routeSurfacePointer('move',e))return;
 if(drawingCapture||desktopCapture){routeSurfacePointer('move',e);return;}
 if(drag?.page){const dx=e.clientX-drag.x;if(Math.abs(dx)>5||drag.moved){drag.moved=true;busy=true;drag.pendingT=THREE.MathUtils.clamp(drag.startT-dx/drag.width,0,1);needsRender=true;renderer.domElement.style.cursor='grabbing';}return;}
 if(busy||transitioning)return;
 if(drag){
  const dx=e.clientX-(drag.lastX??drag.x),dy=e.clientY-(drag.lastY??drag.y);drag.lastX=e.clientX;drag.lastY=e.clientY;
  if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;
  if(!drag.moved)return;
  if(archiveSheet.active){if(drag.action==='__archive_sheet__'){if(archiveSheet.interaction==='read')archiveSheet.pan(dx,dy,readingFocusViewport());else archiveSheet.rotate(dx*.008,dy*.008);}}
  else if(paperReader?.active){if(drag.action==='collectible:ResumePaperRoot')paperReader.pan(dx,dy);renderer.domElement.style.cursor='grabbing';return;}
  else if(drag.readingPan){panReadingFocus(dx,dy);renderer.domElement.style.cursor='grabbing';return;}
  else if(mode==='book'||drawing.active){renderer.domElement.style.cursor='default';return;}
  else if(mode==='bookInspect'&&bookInspectionPose){turnInspectionObject(book,bookInspectionPose,dx*.008,dy*.008);needsRender=true;}
  else if(contentId(inspector.active)&&toys.getState()[contentId(inspector.active)]==='displayed')toys.rotate(contentId(inspector.active),dx*.008,dy*.008);
  else if(cabinet.object)cabinet.rotate(dx*.008,dy*.008);
  else if(inspector.object)inspector.rotate(dx*.008,dy*.008);
  else {pendingOrbitView=orbitView(drag,e.clientX-drag.x,e.clientY-drag.y,{height:innerHeight});needsRender=true;}
  if(inspectedObject()&&!archiveSheet.active)magnifyInspectionObject(inspectedObject(),camera,0);
  renderer.domElement.style.cursor='grabbing';return;
 }
 const hit=findHit(e);hoverAction=hit?.action;renderer.domElement.style.cursor=hit?'pointer':mode!=='home'&&isReturnCorner(e.clientX,e.clientY,innerWidth,innerHeight)?'pointer':'grab';
});
renderer.domElement.addEventListener('pointerup',e=>{
 if(routeDesktopTouch('up',e))return;
 const tracked=touchPoints.has(e.pointerId);
 if(e.pointerId!==activePointerId&&!tracked)return;
 touchPoints.delete(e.pointerId);
 if(pinchActive){
  pinchDistance=null;drag=null;activePointerId=touchPoints.keys().next().value??null;
  if(!touchPoints.size)pinchActive=false;
  return;
 }
 if(e.pointerId!==activePointerId)return;
 // Browser releases capture after pointerup. Clearing the owner first makes
 // that later lostpointercapture a no-op rather than cancelling a new gesture.
 if(!drawingCapture&&!desktopCapture)activePointerId=null;
 if(drawingCapture||desktopCapture){routeSurfacePointer('up',e);cancelSurfaceCapture();return;}
 if(!drag)return;if(drag.page&&drag.moved){releasePageDrag();return;}
 const pressedAction=drag.action,moved=drag.moved||Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>8;drag=null;if(moved||busy||transitioning)return;
 const result=findHit(e);
 // The same object must be under both ends of a click. A moving book must
 // never turn a press into a click on the folder or empty space behind it.
 if(result?.action!==pressedAction)return;
 if(isReturnCorner(e.clientX,e.clientY,innerWidth,innerHeight)){returnHome(true);return;}
 if(archiveSheet.active){if(result?.action!=='__archive_sheet__')archiveSheet.close();return;}
 if(result?.action===activeBookAction&&mode==='book'){
  const index=result.hit.object.userData.archivePage;
  if(Number.isInteger(index)){const page=bookCatalog.get(activeBookAction).pageData[index];archiveSheet.open({source:result.hit.object,page,width:BW-.016,height:BH-.02});return;}
  if(singleReading())return; // A page tap never undoes a pan by advancing.
  const local=book.worldToLocal(result.hit.point.clone());turnPage(local.x<0?-1:1);return;
 }
 if(result){go(result.action);return;}
 if(isReturnCorner(e.clientX,e.clientY,innerWidth,innerHeight))returnHome(true);
 else if(mode!=='home')returnHome();
});
function cancelGesture(e){
 if(e?.pointerId!==undefined&&e.pointerId!==activePointerId&&!touchPoints.has(e.pointerId)&&!desktopTouches.has(e.pointerId))return;
 touchPoints.clear();pinchDistance=null;pinchActive=false;cancelSurfaceCapture();
 if(drag?.page&&drag.moved)releasePageDrag(true);else drag=null;
}
renderer.domElement.addEventListener('pointercancel',cancelGesture);
renderer.domElement.addEventListener('lostpointercapture',cancelGesture);
addEventListener('blur',cancelGesture);
$('#reading-layout').addEventListener('click',toggleReadingLayout);
$('#back').addEventListener('click',()=>returnHome(!['book','bookInspect'].includes(mode)));$('#prev').addEventListener('click',()=>turnPage(-1));$('#next').addEventListener('click',()=>turnPage(1));$('#knife-inspect').addEventListener('click',()=>toys.inspectKnife());document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{b.blur();go(b.dataset.action);}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')returnHome();if(e.target.closest?.('input,textarea,select'))return;if(mode==='book'&&e.key==='ArrowRight'){e.preventDefault();turnPage(1);}if(mode==='book'&&e.key==='ArrowLeft'){e.preventDefault();turnPage(-1);}});
function refitReadingBook(){
 // Closed inspection keeps the user's physical pose through a resize. A full
 // portrait refit can run through the room wall; side cropping is permitted.
 // A projection-only change must not turn a magnified pose into the far zoom limit.
 if(mode==='bookInspect')captureInspectionPose(book,{preserveZoomBaseline:true,camera});
 else if(mode==='book'&&bookOpen){if(!refitReadingFocusPolicy())placeReadingPose(fullReadingPose());updateControls();}
 if(bookOpen&&!singleReading())captureInspectionPose(book);
 renderer.shadowMap.needsUpdate=true;needsRender=true;
}
function refitInspection(){
 if(paperReader?.active){paperReader.resize();needsRender=true;return;}
 const item=contentId(inspector.active),state=toys.getState();
 if(item&&state[item]==='inspecting'){pendingInspectionFit=true;return;}
 if(busy||transitioning||inspector.busy||cabinet.busy){pendingInspectionFit=true;return;}
 const object=item&&state[item]==='displayed'?toys.getObject(item):(cabinet.object||inspector.object);
 if(!object)return;
 // Projection-only resize preserves the physical pose and original zoom stage.
 // A narrow viewport may crop the object; its return pose and route stay intact.
 captureInspectionPose(object,{preserveZoomBaseline:true,camera});
 // BUV alone has a verified fixed-camera fit. A rejected fit also retains the
 // old zoom stage because the new projection was acknowledged above.
 if(object===inspector.object&&object.name==='BUVCard')inspector.refit();
 needsRender=true;
}
function restoreContextResources(){
 if(!contextRecoveryReady||contextLost||!contextRestorePending)return false;
 profiler.resetContext();
 const environment=createRoomEnvironment();
 for(const targetScene of [scene,drawingScene,inspectionPass.scene,readingPass.scene,archiveScene])targetScene.environment=environment;
 drawing.restoreContext();desktop.texture.needsUpdate=true;
 renderer.shadowMap.needsUpdate=true;roomPass.invalidate();ambientOcclusion.invalidate();
 priorCameraMatrix=null;priorProjectionMatrix=null;needsRender=true;contextRestorePending=false;return true;
}
function resize(){
 if(desktopTouchMode)cancelGesture(); // A new screen projection invalidates the current two-contact distance.
 needsRender=true;camera.aspect=innerWidth/innerHeight;homeViewport.request(camera.aspect);camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(renderPixelRatio());composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);
 if(introActive){entrance.resize();return;}
 if(mode==='book'||mode==='bookInspect'){if(busy||archiveSheet.active)pendingBookFit=true;else refitReadingBook();}
 else if(drawing.active)drawing.refit();
 else if(cabinet.object||inspector.active){if(busy||transitioning)pendingInspectionFit=true;else refitInspection();}
 else if(mode!=='home'&&mode!=='view'&&mode!=='cabinet'&&!busy)enterView(mode);
}
addEventListener('resize',resize);
const renderTiming={frames:0,cpuMs:0,maxMs:0,calls:0,triangles:0};renderer.info.autoReset=false;
let priorCameraMatrix=null,priorProjectionMatrix=null;
function tick(){requestAnimationFrame(tick);const elapsed=clock.getDelta(),dt=Math.min(elapsed,.10);if(contextLost)return;restoreContextResources();entrance.update(dt);const changed=needsRender||!!(camTween||bookTween||coverTween||pageTween||pageResetTween);if((bookTween&&!bookTween.readingOnly)||coverTween||((pageTween||pageResetTween)&&!readingPass.enabled))renderer.shadowMap.needsUpdate=true;if(camTween){const a=camTween;a.time+=dt;const t=Math.min(a.time/a.d,1),k=eased(t);camera.position.copy(pointOnCameraRoute(a.route||[a.from,a.to],k));camera.position.copy(constrainCameraPosition(camera.position));currentLook.lerpVectors(a.lookFrom,a.lookTo,k);camera.fov=THREE.MathUtils.lerp(a.fovFrom,a.fovTo,k);camera.updateProjectionMatrix();camera.lookAt(currentLook);if(t===1){camTween=null;a.onEnd?.();}}
const nextHome=homeViewport.peek({mode,busy:busy||introActive,transitioning,returningObject,inspecting:!!inspectedObject(),drawing:drawing.active,archive:archiveSheet.active,cameraTween:!!camTween,bookTween:!!bookTween});
if(nextHome){flyCamera(new THREE.Vector3(...nextHome.position),new THREE.Vector3(...nextHome.look),.55,()=>{homeViewport.commit(nextHome);busy=false;lastDeskView=copyView({...flyCamera.getState(),mode:'home'});updateControls();},{fov:nextHome.fov});needsRender=true;}
flushRoomOrbit();
flushPageDrag();
if(bookTween){const a=bookTween;a.time+=dt;const t=Math.min(a.time/a.d,1),k=eased(t);book.position.lerpVectors(a.from,a.to,k);book.position.y+=Math.sin(Math.PI*t)*a.arc;book.quaternion.slerpQuaternions(a.qFrom,a.qTo,k);if(t===1){bookTween=null;a.onEnd?.();}}
if(coverTween){const a=coverTween;a.time+=dt;const t=Math.min(a.time/a.d,1),k=eased(t);coverHinge.rotation.y=THREE.MathUtils.lerp(a.from,a.to,k);if(a.posFrom)book.position.lerpVectors(a.posFrom,a.posTo,k);if(t===1){coverTween=null;a.onEnd?.();}}
if(pageTween){const a=pageTween;a.time+=dt;const t=Math.min(a.time/a.d,1);deform(a.p,THREE.MathUtils.lerp(a.from,a.to,eased(t)));if(t===1){pageTween=null;a.onEnd?.();}}
if(pageResetTween){const a=pageResetTween;a.time+=dt;const t=Math.min(a.time/a.d,1);pages.forEach((p,i)=>{const target=a.from[i]*(1-eased(t));if(p.group.visible)deform(p,target);else p.t=target;});if(t===1){pageResetTween=null;a.onEnd?.();}}
if(pages.length)updateReadingWindow();
if(pendingBookFit&&!busy&&!archiveSheet.active){pendingBookFit=false;if(mode==='book'||mode==='bookInspect')refitReadingBook();}
if(pendingInspectionFit&&!busy&&!transitioning){pendingInspectionFit=false;refitInspection();}
toys.update(dt);desktop.update(dt);drawing.update(dt);inspector.update(dt);paperReader?.update(dt);cabinet.update(dt);toys.update(0);archiveSheet.update(dt);archivePass.enabled=archiveSheet.active;updateHeadsetLead();profiler.poll();
const inspectRoots=(!busy||paperReader?.active||toys.getState().knife==='inspecting')&&!transitioning&&!camTween&&!drawing.active&&toys.getState().toy!=='turning'?[inspector.object,cabinet.object,contentId(inspector.active)&&['displayed','inspecting'].includes(toys.getState()[contentId(inspector.active)])?toys.getObject(contentId(inspector.active)):null].filter(Boolean):[];
const inspectionChanged=inspectionPass.setObjects(inspectRoots),readingChanged=readingPass.setObject((mode==='book'&&bookOpen||mode==='bookInspect'&&!busy)&&!camTween&&(!bookTween||bookTween.readingOnly)&&!coverTween?book:null);
const inspectLead=inspectionPass.enabled&&['collectible:HeadphonesRoot','collectible:GimbalRoot'].includes(inspector.active);
if(inspectionChanged||readingChanged||leadCopy.visible!==inspectLead){leadCopy.visible=inspectLead;roomPass.excluded=[...inspectRoots,...(readingPass.object?[readingPass.object]:[]),...(inspectLead?[headsetLead]:[])];headsetLead.userData.excludeAmbientOcclusion=inspectLead;roomPass.invalidate();ambientOcclusion.invalidate();renderer.shadowMap.needsUpdate=true;needsRender=true;}inspectionPass.update();readingPass.update();
if(changed||needsRender){
 camera.updateMatrixWorld();const cameraMoved=!priorCameraMatrix||!priorCameraMatrix.equals(camera.matrixWorld)||!priorProjectionMatrix||!priorProjectionMatrix.equals(camera.projectionMatrix);
 if(cameraMoved||renderer.shadowMap.needsUpdate){roomPass.invalidate();ambientOcclusion.invalidate();}
 priorCameraMatrix=camera.matrixWorld.clone();priorProjectionMatrix=camera.projectionMatrix.clone();roomPass.surfaceOnly=drawing.active||inspectionPass.enabled||readingPass.enabled||((mode==='computer'||mode==='keyboard')&&!busy&&!transitioning);drawingPass.enabled=drawing.active;
 activeScreen.updateWorldMatrix(true,false);screenCopy.matrix.copy(activeScreen.matrixWorld);
 renderer.info.reset();profiler.begin(mode);const started=performance.now();drawing.flush();scene.updateMatrixWorld(true);staticBatches.render(()=>composer.render(dt),{camera,avoidPartialFrustum:true,excludeRoots:[...inspectRoots,...(readingPass.object?[readingPass.object]:[])]});const cost=performance.now()-started;profiler.end();
 renderTiming.frames++;renderTiming.cpuMs+=cost;renderTiming.maxMs=Math.max(renderTiming.maxMs,cost);renderTiming.calls+=renderer.info.render.calls;renderTiming.triangles+=renderer.info.render.triangles;
 if(renderTiming.frames===120){console.info('Rendered frame CPU submission (not GPU fps)',JSON.stringify({meanMs:+(renderTiming.cpuMs/120).toFixed(2),maxMs:+renderTiming.maxMs.toFixed(2),meanCalls:Math.round(renderTiming.calls/120),meanTriangles:Math.round(renderTiming.triangles/120)}));Object.assign(renderTiming,{frames:0,cpuMs:0,maxMs:0,calls:0,triangles:0});}
 needsRender=false;
}
if(!introActive&&!busy&&!transitioning&&queuedAction){const next=queuedAction;queuedAction=null;go(next);}
}
patchCabinetTopBookPrint(THREE,assets.find(a=>a.getObjectByName('CabinetTopBooksV2Root')),shelfReplacement.books,{identities:identities.byRoot,anisotropy:renderer.capabilities.getMaxAnisotropy()});
applyAppearanceTuning({assets});
const staticBatches=new StaticRenderBatches(assets);
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;scene.updateMatrixWorld(true);cameraClearance.stopDistance(camera.position,camera.position);composer.setSize(innerWidth,innerHeight);
await waitForUsableContext();contextRecoveryReady=true;restoreContextResources();
resize(); // Catch viewport changes that occurred while model loading awaited.
entrance.progress({phase:'shaders'});
await new Promise(resolve=>requestAnimationFrame(resolve));
if(renderer.compileAsync)await renderer.compileAsync(scene,camera);else renderer.compile(scene,camera);
await waitForUsableContext();restoreContextResources();
entrance.progress({phase:'first-frame'});
entrance.prepare(); // Set entrance/home camera while the loading cover is still opaque.
tick(); // The first real composer frame must succeed before exposing the room.
dispatchEvent(new Event('room-ready')); // startup-recovery clears only its own generic warning.
entrance.ready(); // Reveal only the frame already rendered; this does not reposition the camera.

const projected=p=>{const v=p.clone().project(camera);return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};};
window.__roomDebug={state:()=>({mode,busy,bookOpen,activeBookAction,pageIndex,readingFocus:focusState()?{...focusState(),panPixels:[...focusState().panPixels]}:null,pageProgress:pages.map(p=>p.t),bookPosition:book.position.toArray(),bookQuaternion:book.quaternion.toArray(),cameraPosition:camera.position.toArray(),cameraAspect:camera.aspect,laptopScale:activeLaptop.getWorldScale(new THREE.Vector3()).toArray(),keyboardScale:activeKeyboard.getWorldScale(new THREE.Vector3()).toArray(),renderCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,modelNames:assets.map(a=>a.name),canvasCount:document.querySelectorAll('canvas').length,dialogCount:document.querySelectorAll('dialog').length}),targets:()=>({book:projected(localPoint(book,BW/2,0,.05)),computer:projected(screenCenter()),wall:projected(localPoint(wallBoard,-.3,0,.08)),shelf:projected(new THREE.Vector3(0,2.37,-.36))}),pagePoint:(x,y)=>projected(localPoint(book,BW*x,BH*y,.05)),go};
