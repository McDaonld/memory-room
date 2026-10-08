// Presentation policy for detachable cables, not a physics solver.
// park() must run before the inspector measures bounds; restore() after exact object return.
export function createInspectionCableParking({cables=[],terminals=[],onChange=()=>{}}={}){
 let parked=false,saved=[];
 function snapshot(object,detach){return {object,detach,parent:object.parent,index:object.parent?.children.indexOf(object)??-1,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone(),matrix:object.matrix.clone(),matrixAutoUpdate:object.matrixAutoUpdate,visible:object.visible};}
 function park(){
  if(parked)return false;
  saved=[...new Set(cables.filter(Boolean))].map(o=>snapshot(o,true));
  for(const o of [...new Set(terminals.filter(Boolean))])if(!saved.some(s=>s.object===o))saved.push(snapshot(o,false));
  for(const s of saved){s.object.visible=false;if(s.detach)s.object.removeFromParent();}
  parked=true;onChange();return true;
 }
 function restore(){
  if(!parked)return false;
  for(const s of saved){
   const o=s.object;
   if(s.detach&&s.parent){s.parent.add(o);const list=s.parent.children,at=list.indexOf(o);list.splice(at,1);list.splice(Math.min(s.index,list.length),0,o);}
   o.position.copy(s.position);o.quaternion.copy(s.quaternion);o.scale.copy(s.scale);o.matrix.copy(s.matrix);o.matrixAutoUpdate=s.matrixAutoUpdate;o.visible=s.visible;o.updateWorldMatrix(true,true);
  }
  saved=[];parked=false;onChange();return true;
 }
 return {park,restore,dispose:restore,get parked(){return parked;}};
}
