import { readdir, readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');
async function walk(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);out.push(...entry.isDirectory()?await walk(full):[full]);}return out;}
const files=await walk(dist);
let imports=0,jsonFiles=0,glbs=0;
for(const file of files){
  const rel=path.relative(dist,file);
  if(file.endsWith('.js')){
    execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
    const source=await readFile(file,'utf8');
    for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      await access(path.resolve(path.dirname(file),match[1].split('?')[0])); imports++;
    }
  }
  if(file.endsWith('.json')){JSON.parse(await readFile(file,'utf8'));jsonFiles++;}
  if(file.endsWith('.glb')){
    const bytes=await readFile(file); glbs++;
    assert.equal(bytes.toString('ascii',0,4),'glTF',rel);
    assert.equal(bytes.readUInt32LE(4),2,rel);
    assert.equal(bytes.readUInt32LE(8),bytes.length,rel);
    const count=bytes.readUInt32LE(12);
    assert.equal(bytes.readUInt32LE(16),0x4e4f534a,rel);
    const gltf=JSON.parse(bytes.toString('utf8',20,20+count).trim());
    assert.equal(gltf.images?.length||0,0,`${rel}: embedded images need review`);
    assert.equal(gltf.textures?.length||0,0,`${rel}: textures need review`);
    assert.ok((gltf.nodes||[]).length>0,`${rel}: no nodes`);
    for(const buffer of gltf.buffers||[]) assert.ok(!buffer.uri,`${rel}: external buffer`);
    const binStart=20+count;
    const binLength=binStart<bytes.length?bytes.readUInt32LE(binStart):0;
    for(const view of gltf.bufferViews||[])assert.ok((view.byteOffset||0)+view.byteLength<=binLength,`${rel}: buffer overflow`);
    const text=JSON.stringify(gltf);
    assert.ok(!/[A-Z]:[\\/]|wxid_/i.test(text),`${rel}: private metadata`);
  }
}
assert.equal(glbs,20,'The full room requires all 20 model files.');
const source=await readFile(path.join(dist,'scene.js'),'utf8');
for(const match of source.matchAll(/['"](assets\/[^'"`?]+)(?:\?[^'"]*)?['"]/g)){
  if(!match[1].includes('${')) await access(path.join(dist,match[1]));
}
for(const file of files.filter(f=>/\.(html|js|css|json)$/.test(f)&&!f.includes(path.sep+'vendor'+path.sep))){
  assert.ok(!/wxid_|[A-Z]:\\(?:Users|xwechat_files)\\/.test(await readFile(file,'utf8')),`${path.relative(dist,file)}: private path or account identifier`);
}
console.log(`Verified ${files.length} distribution files, ${imports} relative imports, ${jsonFiles} JSON files, ${glbs} image-free GLB models.`);
console.log('This checks asset integrity and known private identifiers, not rendered browser behavior or all possible personal data.');
