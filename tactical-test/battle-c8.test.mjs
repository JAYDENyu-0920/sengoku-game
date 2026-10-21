import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMap} from './battle-core.mjs';
import {createTurnBattle} from './battle-turns.mjs';
import {runAutoBattle,visibleKnowledge} from './battle-autoplay.mjs';
const unit=(id,side,type,q,r)=>({id,side,type,q,r,morale:80,soldiers:500});
function setup(units=[unit('a','attacker','spear',1,1),unit('d','defender','spear',8,8)]){
 return createTurnBattle({map:makeMap(),units,seed:'C8',commanders:{attacker:'a',defender:'d'}});
}
test('C8 battle completes at round limit without UI',()=>{const r=runAutoBattle(setup());assert.equal(r.finished,true);assert.equal(r.state.result.reason,'ROUND_LIMIT');assert.equal(r.state.round,12);});
test('C8 deterministic events and commands',()=>{const a=runAutoBattle(setup()),b=runAutoBattle(setup());assert.deepEqual(a,b);});
test('C8 initial state never mutated',()=>{const s=setup(),before=structuredClone(s);runAutoBattle(s);assert.deepEqual(s,before);});
test('C8 bounded execution yields explicit stop reason',()=>{const r=runAutoBattle(setup(),{maxCommands:1});assert.equal(r.finished,false);assert.equal(r.stopped,'COMMAND_LIMIT');});
test('C8 knowledge hides omitted enemy',()=>{const s=setup();assert.equal(visibleKnowledge(s,'attacker',{visibleIds:[]}).visibleEnemies.length,0);assert.equal(visibleKnowledge(s,'attacker').visibleEnemies.length,1);});
test('C8 rejects invalid command cap',()=>assert.throws(()=>runAutoBattle(setup(),{maxCommands:0}),/INVALID_MAX_COMMANDS/));
test('C8 attack in range resolves combat',()=>{const s=setup([unit('a','attacker','bow',1,1),unit('d','defender','spear',3,1)]);const r=runAutoBattle(s);assert.ok(r.state.events.some(e=>e.type==='ATTACK_RESOLVED'));});
test('C8 trace can be disabled',()=>{const r=runAutoBattle(setup(),{trace:false});assert.deepEqual(r.commands,[]);assert.ok(r.issued>0);});
