import test from 'node:test';import assert from 'node:assert/strict';
import {SIZES,ROSTER,validateFormation,buildFormationSnapshot} from './battle-formation.mjs';
import {createTurnBattle} from './battle-turns.mjs';import {makeMap} from './battle-core.mjs';
const base={map:makeMap(10,10),objectives:[],exits:{attacker:[],defender:[]}};
for(const [size,n] of Object.entries(SIZES))test(`D8-A1 ${size} supports ${n} units per side`,()=>{const officers=ROSTER.slice(0,n).map(o=>o.id),formation={size,officers,commander:officers[0]};assert.equal(validateFormation(formation).ok,true);const snap=buildFormationSnapshot(base,formation);assert.equal(snap.units.length,n*2);assert.equal(new Set(snap.units.map(u=>u.q+','+u.r)).size,n*2);assert.equal(createTurnBattle(snap).units.length,n*2);});
test('reject duplicates, invalid commander, wrong count and unknown size',()=>{const f={size:'skirmish',officers:['a1','a2','a3'],commander:'a1'};for(const bad of [{...f,officers:['a1','a1','a3']},{...f,commander:'a4'},{...f,officers:['a1','a2']},{...f,size:'unknown'},{...f,officers:['a1','a2','missing']}])assert.equal(validateFormation(bad).ok,false);});
