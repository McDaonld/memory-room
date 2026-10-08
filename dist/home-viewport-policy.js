// Responsive home framing; inspection and reading own their temporary views.
export const PRESET_FOV=52;
export function homeViewportProfile(aspect){
 const a=Number.isFinite(aspect)&&aspect>0?aspect:16/9;
 if(a>=.85)return {key:'wide',position:[0,2.30,3.66],look:[.10,2.40,-.50],fov:52,aspect:a,horizontalReferenceFits:true};
 // Keep the desk central instead of increasing vertical FOV toward 90 degrees
 // to fit every side object. Side shelves remain reachable by room rotation.
 const required=Math.min(72,66+Math.max(0,390/844-a)*46.5);
 return {key:'portrait',position:[.28,2.45,3.45],look:[.28,2.29,-.50],fov:required,aspect:a,horizontalReferenceFits:false};
}
function same(a,b){return a.key===b.key&&Math.abs(a.fov-b.fov)<1e-6;}
export function createHomeViewportPolicy(initialAspect){
 let applied=homeViewportProfile(initialAspect),desired=applied;
 return {
  get initial(){return {...applied,position:[...applied.position],look:[...applied.look]};},
  request(aspect){desired=homeViewportProfile(aspect);return !same(applied,desired);},
  get pending(){return !same(applied,desired);},
  peek({mode,busy=false,transitioning=false,returningObject=false,inspecting=false,drawing=false,archive=false,cameraTween=false,bookTween=false}={}){
   if(mode!=='home'||busy||transitioning||returningObject||inspecting||drawing||archive||cameraTween||bookTween||same(applied,desired))return null;
   return {...desired,position:[...desired.position],look:[...desired.look]};
  },
  // Commit only after the camera/FOV transition successfully reaches target.
  // A resize arriving during it remains pending if it needs another profile.
  commit(profile){applied={...profile,position:[...profile.position],look:[...profile.look]};},
 };
}
