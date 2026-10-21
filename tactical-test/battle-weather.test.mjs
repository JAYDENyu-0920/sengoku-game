import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMap} from './battle-core.mjs';
import {createCombatBattle,combatDispatch,validateAttack} from './battle-combat.mjs';
import {reloadAtRoundStart,gunRangeModifier} from './battle-weather.mjs';
import {estimateAttack} from './battle-d6.mjs';
const unit=(id,side,type,q,r)=>({id,side,type,q,r,soldiers:500,morale:80});
const mk=(weather,d=2)=>createCombatBattle({weather,seed:'weather-fixed',map:makeMap(10,10),units:[unit('g','attacker','gun',1,2),unit('b','defender','spear',1+d,2)]});
for(const [w,max,delay] of [['sun',4,1],['cloud',4,1],['rain',3,2],['fog',2,2]]){
 test(`${w} gun range and auto reload timing`,()=>{
  const s=mk(w,max);s.round=1;assert.equal(validateAttack(s,'g','b').ok,true);
  const shot=combatDispatch(s,{id:'fire',type:'ATTACK_UNIT',unitId:'g',targetId:'b',expectedRevision:0});assert.equal(shot.ok,true);
  const n=shot.state;assert.equal(n.units[0].gunReloadUntilRound,1+delay);assert.equal(validateAttack(n,'g','b').error,'GUN_UNLOADED');
  for(let round=2;round<1+delay;round++){n.round=round;reloadAtRoundStart(n);assert.equal(validateAttack(n,'g','b').error,'GUN_UNLOADED');}
  n.round=1+delay;reloadAtRoundStart(n);assert.equal(n.units[0].gunState,'READY');assert.equal(validateAttack(n,'g','b').ok,true);
 });
}
test('weather shortens range only for gun',()=>{assert.equal(validateAttack(mk('rain',4),'g','b').error,'OUT_OF_RANGE');assert.equal(validateAttack(mk('fog',3),'g','b').error,'OUT_OF_RANGE');const s=mk('fog',3);s.units[0].type='bow';assert.equal(validateAttack(s,'g','b').ok,true);});
test('close gun damage higher than distant and estimate reflects it',()=>{assert.deepEqual([2,3,4].map(gunRangeModifier),[1.3,1.1,.9]);const close=estimateAttack(mk('sun',2),'g','b');const far=estimateAttack(mk('sun',4),'g','b');assert.ok(close.min>far.max);});
test('invalid weather falls back to sunny range',()=>{assert.equal(validateAttack(mk('unknown',4),'g','b').ok,true);});
