import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createStaticServer } from '../scripts/serve.mjs';

test('local server serves modules, reports missing assets, and contains paths',async t=>{
  const server=createStaticServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const page=await fetch(base);
  assert.equal(page.status,200); assert.match(await page.text(),/Memory Room/);
  const module=await fetch(base+'/scene.js');
  assert.match(module.headers.get('content-type'),/javascript/);
  assert.equal((await fetch(base+'/missing-asset.glb')).status,404);
  const status = await new Promise((resolve,reject)=>{
    request(base,{path:'/%2e%2e/package.json'},res=>{res.resume();resolve(res.statusCode);}).on('error',reject).end();
  });
  assert.equal(status,403);
  assert.equal((await fetch(base,{method:'POST'})).status,405);
});
