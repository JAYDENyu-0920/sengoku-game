import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMap} from './battle-core.mjs';
import {createCombatBattle,combatDispatch} from './battle-combat.mjs';
const unit=(id,side,type,q,r)=>({id,side,type,q,r,soldiers:500,morale:80});
const scenario=damageScale=>createCombatBattle({map:makeMap(10,10),seed:'d2-check',units:[unit('a','attacker','spear',2,2),unit('d','defender','spear',3,2)],...(damageScale?{damageScale}:{})});
function attack(s){const r=combatDispatch(s,{id:'attack',type:'ATTACK_UNIT',unitId:'a',targetId:'d',side:'attacker',expectedRevision:0});assert.equal(r.ok,true,JSON.stringify(r));return r.state.units.find(u=>u.id==='d').soldiers;}
test('D2 sample attack accelerates loss compared to legacy default',()=>{assert.ok(attack(scenario(2.7))<attack(scenario()));});
test('default damageScale remains 1 for old battles',()=>{assert.equal(scenario().damageScale,1);});
test('D2 configured fast scale persists in battle state',()=>{assert.equal(scenario(2.7).damageScale,2.7);});
