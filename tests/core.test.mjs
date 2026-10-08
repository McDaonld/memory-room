import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { makeOBB, obbSAT, obbFromLocalBounds, checkOBBPath } from '../dist/book-collision.js';
import { createHomeViewportPolicy } from '../dist/home-viewport-policy.js';

const v = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const box = (x) => makeOBB(v(x),v(.5,.5,.5));
test('contact is distinct from penetration and separation',()=>{
  assert.equal(obbSAT(box(0),box(1)).touching,true);
  assert.equal(obbSAT(box(0),box(.9)).penetrating,true);
  assert.equal(obbSAT(box(0),box(1.1)).intersects,false);
});
test('rotated world bounds do not mutate source bounds',()=>{
  const bounds = new THREE.Box3(v(0,0,0),v(2,1,1));
  const original = bounds.clone();
  const q = new THREE.Quaternion().setFromAxisAngle(v(0,0,1),Math.PI/2);
  const result = obbFromLocalBounds(bounds,{position:v(3),quaternion:q});
  assert.ok(result.center.distanceTo(v(2.5,1,.5))<1e-8);
  assert.ok(bounds.equals(original));
});
test('moving book detects an obstacle between clear endpoints',()=>{
  const bounds = new THREE.Box3(v(-.05,-.05,-.05),v(.05,.05,.05));
  const hit = checkOBBPath(bounds,[{position:v(-1)},{position:v(1)}],[makeOBB(v(),v(.1,.1,.1),undefined,'desk')],{maxPointStep:.02});
  assert.equal(hit.clear,false);
});
test('sampling budget fails explicitly rather than silently skipping collisions',()=>{
  const bounds = new THREE.Box3(v(-1,-1,-1),v(1,1,1));
  assert.throws(()=>checkOBBPath(bounds,[{position:v()},{position:v(10)}],[],{maxSamples:2}),/maxSamples/);
});
test('phone resize waits until the reader returns home',()=>{
  const policy=createHomeViewportPolicy(16/9);
  policy.request(390/844);
  assert.equal(policy.peek({mode:'reading'}),null);
  assert.equal(policy.peek({mode:'home',busy:true}),null);
  const target=policy.peek({mode:'home'});
  assert.equal(target.key,'portrait');
  policy.commit(target);
  assert.equal(policy.pending,false);
});
