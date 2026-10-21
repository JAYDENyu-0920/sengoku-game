import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMap,reachable} from './battle-core.mjs';
import {createTurnBattle,turnDispatch} from './battle-turns.mjs';
import {stageMove,previewPosition,canUndoPreview,remainingUnits} from './battle-preview.mjs';
function setup(){let s=createTurnBattle({map:makeMap(10,10),seed:'D3',units:[{id:'a',side:'attacker',type:'spear',q:1,r:1,soldiers:500,morale:80},{id:'b',side:'attacker',type:'bow',q:1,r:3,soldiers:500,morale:80},{id:'d',side:'defender',type:'spear',q:8,r:8,soldiers:500,morale:80}],commanders:{attacker:'a',defender:'d'}});return s;}
test('available unit hint counts unactivated own units',()=>{const s=setup();assert.deepEqual(remainingUnits(s),['a','b']);});
test('preview changes rendered position but not battle state',()=>{let s=setup();s=turnDispatch(s,{id:'a1',type:'ACTIVATE_UNIT',side:'attacker',unitId:'a',expectedRevision:s.revision}).state;const before=structuredClone(s),entry=reachable(s.units[0],s)[0];const p=stageMove(s,'a',entry);assert.equal(previewPosition(s,p,'a').q,p.q);assert.deepEqual(s,before);assert.equal(canUndoPreview(s,p),true);});
test('preview may be replaced and cancelled without revision',()=>{let s=setup();s=turnDispatch(s,{id:'a1',type:'ACTIVATE_UNIT',side:'attacker',unitId:'a',expectedRevision:s.revision}).state;const entries=reachable(s.units[0],s);assert.ok(entries.length>=2);let p=stageMove(s,'a',entries[0]);p=stageMove(s,'a',entries[1]);assert.equal(p.q,entries[1].hex.q);assert.equal(s.units[0].q,1);p=null;assert.equal(canUndoPreview(s,p),false);});
test('preview rejected before activation',()=>{const s=setup();assert.throws(()=>stageMove(s,'a',{hex:{q:2,r:1},path:[{q:2,r:1}]}),/PREVIEW_NOT_ALLOWED/);});
test('preview invalidates after engine command',()=>{let s=setup();s=turnDispatch(s,{id:'a1',type:'ACTIVATE_UNIT',side:'attacker',unitId:'a',expectedRevision:s.revision}).state;const p=stageMove(s,'a',reachable(s.units[0],s)[0]);s=turnDispatch(s,{id:'a2',type:'END_ACTIVATION',side:'attacker',expectedRevision:s.revision}).state;assert.equal(canUndoPreview(s,p),false);});
test('available count updates after activation',()=>{let s=setup();s=turnDispatch(s,{id:'a1',type:'ACTIVATE_UNIT',side:'attacker',unitId:'a',expectedRevision:s.revision}).state;assert.deepEqual(remainingUnits(s,'attacker'),['b']);});
