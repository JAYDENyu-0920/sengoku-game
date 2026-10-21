import test from 'node:test';
import assert from 'node:assert/strict';
import {matchupModifier,matchupLabel,MATCHUP_HINTS} from './battle-matchups.mjs';
import {createCombatBattle,combatDispatch} from './battle-combat.mjs';
import {makeMap} from './battle-core.mjs';
const types=['spear','cavalry','bow','gun'];
for(const [a,b] of [['spear','cavalry'],['cavalry','bow'],['bow','spear']]){
 test(`${a} counters ${b}`,()=>{assert.equal(matchupModifier(a,b),1.15);assert.equal(matchupModifier(b,a),.9);});
}
test('gun and same-type engagements have neutral matchup',()=>{for(const t of types){assert.equal(matchupModifier('gun',t),1);assert.equal(matchupModifier(t,'gun'),1);assert.equal(matchupModifier(t,t),1);}});
test('legend is consistent with implemented advantage matrix',()=>{assert.equal(MATCHUP_HINTS.length,3);for(const h of MATCHUP_HINTS){assert.equal(matchupModifier(h.attacker,h.defender),1.15);assert.equal(matchupLabel(h.attacker,h.defender),'相剋優勢');}});
function battle(a,b){return createCombatBattle({map:makeMap(10,10),seed:'d5-fixed',damageScale:2.7,units:[{id:'a',side:'attacker',type:a,q:1,r:1,soldiers:500,morale:80},{id:'b',side:'defender',type:b,q:2,r:1,soldiers:500,morale:80}]});}
function hit(a,b){const s=battle(a,b);const r=combatDispatch(s,{id:'hit',type:'ATTACK_UNIT',unitId:'a',targetId:'b',expectedRevision:0});assert.equal(r.ok,true);return r.state.events.find(e=>e.type==='ATTACK_RESOLVED').loss;}
test('matchup advantage actually changes combat damage',()=>{assert.ok(hit('spear','cavalry')>hit('spear','spear'));});
test('matchup disadvantage actually lowers combat damage',()=>{assert.ok(hit('cavalry','spear')<hit('cavalry','cavalry'));});
test('matchup deterministic with fixed seed',()=>{assert.equal(hit('spear','cavalry'),hit('spear','cavalry'));});
