// Reversible, modest A/B adjustment. Run before static render batches are built.
// Original materials/textures are never mutated or disposed.
const applied=new WeakMap();
const rules=[
 {root:'KeyboardRoot',material:'Keyboard frosted milky keycaps',colorScale:.90},
 {root:'JordanBackpackRoot',mesh:'BackpackFrontFlapFace',material:'Jordan neutral black woven polyester',colorScale:1.22,roughnessMax:.89},
 {root:'JordanBackpackRoot',mesh:'BackpackMainRoundedShell',material:'Jordan side gusset black polyester',colorScale:1.22,roughnessMax:.89},
];
export const APPEARANCE_MATERIALS=Object.freeze(rules.map(r=>r.material));

export function applyAppearanceTuning({assets=[],onChange=()=>{}}={}){
 const list=Array.isArray(assets)?assets:assets instanceof Map?[...assets.values()]:assets?.isObject3D?[assets]:Object.values(assets);
 const records=[];let didChange=false;
 for(const name of new Set(rules.map(r=>r.root))){
  const root=list.map(a=>(a?.scene||a)?.getObjectByName?.(name)).find(Boolean);
  if(!root)continue;
  if(applied.has(root)){records.push(applied.get(root));continue;}
  const record={root,edits:[],materials:new Set(),changes:[]},clones=new Map();
  root.traverse(mesh=>{
   if(!mesh.isMesh)return;
   const original=mesh.material,source=Array.isArray(original)?original:[original];let changed=false;
   const replacement=source.map(material=>{
    const rule=rules.find(r=>r.root===name&&r.material===material?.name&&(!r.mesh||r.mesh===mesh.name));
    if(!rule||!material?.color?.multiplyScalar||!material.clone)return material;
    let copy=clones.get(material);
    if(!copy){
     copy=material.clone();copy.color.multiplyScalar(rule.colorScale);
     if(rule.roughnessMax!==undefined)copy.roughness=Math.min(material.roughness,rule.roughnessMax);
     copy.needsUpdate=true;clones.set(material,copy);record.materials.add(copy);
    }
    changed=true;record.changes.push({root:name,mesh:mesh.name,material:material.name,colorScale:rule.colorScale,before:{color:material.color.toArray(),roughness:material.roughness},after:{color:copy.color.toArray(),roughness:copy.roughness}});
    return copy;
   });
   if(changed){mesh.material=Array.isArray(original)?replacement:replacement[0];record.edits.push({mesh,original,replacement:mesh.material});}
  });
  if(record.edits.length){applied.set(root,record);records.push(record);didChange=true;}
 }
 if(didChange)onChange();
 return {
  changes:records.flatMap(r=>r.changes),
  restore(){
   let restored=false;
   for(const record of records){
    if(applied.get(record.root)!==record)continue;
    for(const edit of record.edits)if(edit.mesh.material===edit.replacement)edit.mesh.material=edit.original;
    for(const material of record.materials)material.dispose();
    applied.delete(record.root);restored=true;
   }
   if(restored)onChange();return restored;
  },
 };
}

// Deliberately excluded: JordanDetails_JordanBackpackRoot_Jordan_neutral_black_woven_polyester.
// That merged mesh contains both body panels AND padded shoulder straps. Adjusting
// its whole material would also brighten the straps, so this minimal candidate
// targets only the separately preserved front flap and rounded outer shell.
