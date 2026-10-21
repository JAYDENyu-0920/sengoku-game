import {reloadAtRoundStart} from './battle-weather.mjs';
/** B1 V4.0-C3 tactical turn controller. Pure state transitions, no overworld mutations. */
import {createCombatBattle,combatDispatch,moraleState} from './battle-combat.mjs';
import {MOVEMENT,hexDistance} from './battle-core.mjs';
import {checkSkill,START_ORDERS,MAX_ORDERS,ROUND_RECOVERY} from './battle-skills.mjs';
const SIDES=['attacker','defender'];
const clone=structuredClone;
const active=u=>u.soldiers>0&&!u.routed&&!u.withdrawn;
const usable=(s,side)=>s.units.filter(u=>u.side===side&&active(u));
const byId=(s,id)=>s.units.find(u=>u.id===id);
const onHex=(u,h)=>u.q===h.q&&u.r===h.r;
function event(s,id,type,data={}){s.events.push({sequence:s.events.length+1,commandId:id,type,...data});}
function finish(s,id,winner,reason){s.phase='TACTICAL_FINISHED';s.result={winner,reason,round:s.round,retreat:clone(s.retreat),survivors:s.units.map(u=>({unitId:u.id,side:u.side,soldiers:u.soldiers,morale:u.morale,routed:!!u.routed,withdrawn:!!u.withdrawn}))};s.activation=null;s.pending=null;event(s,id,'BATTLE_FINISHED',{winner,reason});}
function assess(s,id){
  for(const side of SIDES){const commander=byId(s,s.commanders?.[side]);if(commander&&(commander.routed||commander.soldiers<=0)){finish(s,id,SIDES.find(x=>x!==side),'COMMANDER_ROUTED');return true;}}
  for(const side of SIDES){if(s.retreat[side]?.declared&&s.units.filter(u=>u.side===side).every(u=>u.withdrawn||u.routed||u.soldiers<=0)){finish(s,id,SIDES.find(x=>x!==side),'ORDERLY_RETREAT');return true;}}
  for(const side of SIDES){if(!usable(s,side).length){finish(s,id,SIDES.find(x=>x!==side),'NO_ACTIVE_UNITS');return true;}}
  return false;
}
function control(s,obj){const on=s.units.filter(u=>active(u)&&hexDistance(u,obj)<=1);const sides=new Set(on.map(u=>u.side));return sides.size===1?[...sides][0]:null;}
function roundEnd(s,id){
  for(const obj of s.objectives){const holder=control(s,obj);obj.holder=holder;obj.streak=holder&&holder===obj.lastHolder?obj.streak+1:holder?1:0;obj.lastHolder=holder;event(s,id,'OBJECTIVE_UPDATED',{objectiveId:obj.id,holder,streak:obj.streak});}
  const achieved=s.objectives.filter(o=>o.streak>=2);
  if(achieved.length){const sides=new Set(achieved.map(o=>o.holder));if(sides.size===1){finish(s,id,achieved[0].holder,'OBJECTIVE_HELD');return;}}
  if(s.round>=12){
    // P0.1 provisional deterministic score; weights require explicit final balance approval.
    const scores={};for(const side of SIDES){const initial=s.units.filter(u=>u.side===side).reduce((n,u)=>n+u.initialSoldiers,0);
      const remaining=s.units.filter(u=>u.side===side).reduce((n,u)=>n+u.soldiers,0);
      const morale=s.units.filter(u=>u.side===side&&u.soldiers>0).reduce((n,u)=>n+u.morale*u.soldiers,0)/Math.max(1,remaining);
      const objPoints=s.objectives.length?s.objectives.filter(o=>o.holder===side).length/s.objectives.length:0;
      const commander=byId(s,s.commanders?.[side]);const commanderPoints=commander&&active(commander)?1:0;
      scores[side]=40*(remaining/Math.max(1,initial))+20*(morale/100)+25*objPoints+15*commanderPoints;
    }
    const delta=scores.attacker-scores.defender;finish(s,id,Math.abs(delta)<1e-9?null:delta>0?'attacker':'defender','ROUND_LIMIT');s.result.scores=scores;return;
  }
  s.round++;reloadAtRoundStart(s);for(const side of SIDES)s.orders[side]=Math.min(MAX_ORDERS,s.orders[side]+ROUND_RECOVERY);s.units.forEach(u=>{u.activatedThisRound=false;u.reactionUsed=false;u.movedThisActivation=false;});
  s.turnOrder=[];s.nextSide=s.firstSide;event(s,id,'ROUND_STARTED',{round:s.round});
}
function validateSnapshot(snapshot){
  const sideCount=Object.fromEntries(SIDES.map(side=>[side,snapshot.units.filter(u=>u.side===side).length]));
  if(sideCount.attacker<1||sideCount.defender<1||sideCount.attacker>8||sideCount.defender>8)throw Error('INVALID_SIDES');
  for(const u of snapshot.units)if(!SIDES.includes(u.side)||!u.id||!Number.isInteger(u.morale??80)||u.morale<0||u.morale>100)throw Error('INVALID_UNIT');
  const ids=new Set(snapshot.units.map(u=>u.id));for(const side of SIDES)if(!ids.has(snapshot.commanders?.[side])||snapshot.units.find(u=>u.id===snapshot.commanders[side]).side!==side)throw Error('INVALID_COMMANDER');
  if(!SIDES.includes(snapshot.firstSide??'attacker'))throw Error('INVALID_FIRST_SIDE');
  for(const o of snapshot.objectives??[])if(!o.id||!Number.isInteger(o.q)||!Number.isInteger(o.r))throw Error('INVALID_OBJECTIVE');
}
export function createTurnBattle(snapshot){validateSnapshot(snapshot);const s=createCombatBattle(snapshot);s.round=1;s.orders={attacker:START_ORDERS,defender:START_ORDERS};s.firstSide=snapshot.firstSide??'attacker';s.nextSide=s.firstSide;s.turnOrder=[];s.activation=null;s.commanders=clone(snapshot.commanders);s.objectives=(snapshot.objectives??[]).map(o=>({...clone(o),holder:null,lastHolder:null,streak:0}));s.retreat={attacker:{declared:false,exits:clone(snapshot.exits?.attacker??[])},defender:{declared:false,exits:clone(snapshot.exits?.defender??[])}};s.units.forEach(u=>{u.initialSoldiers=u.soldiers;u.activatedThisRound=false;u.reactionUsed=false;u.routed=u.routed??moraleState(u.morale)==='ROUTED';});return s;}
const error=(state,code)=>({ok:false,error:code,state});
function finishActivation(s,id){if(!s.activation)return false;event(s,id,'ACTIVATION_ENDED',{unitId:s.activation.unitId});s.activation=null;const eligible=side=>usable(s,side).some(u=>!u.activatedThisRound);
  if(!SIDES.some(eligible)){roundEnd(s,id);return true;}
  const other=SIDES.find(side=>side!==s.nextSide);if(eligible(other))s.nextSide=other;else if(!eligible(s.nextSide))s.nextSide=other;return true;
}
export function turnDispatch(state,cmd){
  if(!cmd?.id||!cmd.type)return error(state,'INVALID_COMMAND');
  if(state.committedCommands.includes(cmd.id))return {ok:true,state,duplicate:true};
  if(cmd.expectedRevision!==state.revision)return error(state,'STALE_REVISION');
  if(state.phase==='TACTICAL_FINISHED')return error(state,'BATTLE_FINISHED');
  const s=clone(state);const side=cmd.side;
  if(s.phase==='REACTION_PENDING'){
    if(!['CHOOSE_REACTION','PASS_REACTION'].includes(cmd.type))return error(state,'REACTION_REQUIRED');
    const reactSide=byId(s,s.pending.window.candidates[0]?.unitId)?.side;
    if(side!==reactSide)return error(state,'WRONG_SIDE');
    const r=combatDispatch(s,cmd);if(!r.ok)return error(state,r.error);
    const n=r.state;if(assess(n,cmd.id)){/* no further movement after commander defeat */}
    else if(n.phase==='ACTIVE'&&!n.pending&&n.activation?.unitId){n.activation.moved=true;}
    return {ok:true,state:n,events:n.events.slice(state.events.length),paused:n.phase==='REACTION_PENDING'};
  }
  if(cmd.type==='ACTIVATE_UNIT'){
    const u=byId(s,cmd.unitId);if(s.activation)return error(state,'ACTIVATION_IN_PROGRESS');if(!u||!active(u))return error(state,'INACTIVE_UNIT');
    if(u.side!==side||side!==s.nextSide)return error(state,'WRONG_SIDE');if(u.activatedThisRound)return error(state,'ALREADY_ACTIVATED');
    u.activatedThisRound=true;s.activation={unitId:u.id,side,moved:false,mainUsed:false};event(s,cmd.id,'UNIT_ACTIVATED',{unitId:u.id,round:s.round});
  }else if(cmd.type==='END_ACTIVATION'){
    if(!s.activation||s.activation.side!==side)return error(state,'NO_OWN_ACTIVATION');finishActivation(s,cmd.id);
  }else if(cmd.type==='DECLARE_RETREAT'){
    if(s.activation)return error(state,'ACTIVATION_IN_PROGRESS');if(side!==s.nextSide)return error(state,'WRONG_SIDE');if(s.retreat[side]?.declared)return error(state,'ALREADY_RETREATING');
    s.retreat[side].declared=true;event(s,cmd.id,'RETREAT_DECLARED',{side});
  }else if(cmd.type==='WITHDRAW_UNIT'){
    if(!s.activation||s.activation.side!==side||s.activation.unitId!==cmd.unitId)return error(state,'NO_OWN_ACTIVATION');
    if(!s.retreat[side].declared)return error(state,'RETREAT_NOT_DECLARED');
    const u=byId(s,cmd.unitId),exit=s.retreat[side].exits.find(h=>onHex(u,h));if(!exit)return error(state,'NOT_AT_EXIT');
    u.withdrawn=true;u.q=null;u.r=null;event(s,cmd.id,'UNIT_WITHDRAWN',{unitId:u.id,exitId:exit.id??null});finishActivation(s,cmd.id);assess(s,cmd.id);
  }else if(['MOVE_UNIT','ATTACK_UNIT','USE_SKILL'].includes(cmd.type)){
    if(!s.activation||s.activation.side!==side||s.activation.unitId!==cmd.unitId)return error(state,'NO_OWN_ACTIVATION');
    const a=s.activation,u=byId(s,cmd.unitId);
    if(cmd.type==='MOVE_UNIT'&&a.moved)return error(state,'MOVE_ALREADY_USED');
    if(['ATTACK_UNIT','USE_SKILL'].includes(cmd.type)&&a.mainUsed)return error(state,'MAIN_ALREADY_USED');
    if(cmd.type==='RELOAD_GUN'&&(a.mainUsed||a.moved))return error(state,'MAIN_ALREADY_USED');
    if(['ATTACK_UNIT','USE_SKILL'].includes(cmd.type)&&u.type==='gun'&&a.moved)return error(state,'GUN_MOVED');
    let skill=null;
    if(cmd.type==='USE_SKILL'){
      const check=checkSkill(s,cmd);if(!check.ok)return error(state,check.error);
      skill=check.skill;if(skill.kind==='reaction')return error(state,'REACTION_ONLY');
      if(skill.kind==='attack'&&skill.id==='charge'&&(!a.moved||!u.movedThisActivation||!a.movedDistance||a.movedDistance<2))return error(state,'CHARGE_REQUIRES_TWO_STEPS');
    }
    const action=cmd.type==='USE_SKILL'?(skill.kind==='attack'?{...cmd,type:'ATTACK_UNIT',skillBonus:skill.bonus,skillId:skill.id}:{...cmd,type:'USE_GUARD',skillId:skill.id}):cmd;
    const r=skill?.kind==='stance'?{ok:true,state:s,events:[]}:combatDispatch(s,action);if(!r.ok)return error(state,r.error);
    const n=r.state;if(skill){n.orders[side]-=skill.cost;if(skill.kind==='stance')n.units.find(x=>x.id===u.id).guardUntilRound=n.round+1;n.events.push({sequence:n.events.length+1,commandId:cmd.id,type:'SKILL_USED',unitId:u.id,skillId:skill.id,cost:skill.cost});if(skill.kind==='stance'){n.revision++;n.committedCommands.push(cmd.id);}}
    if(cmd.type==='MOVE_UNIT'){n.activation.moved=true;n.activation.movedDistance=(cmd.path??[]).length;}else n.activation.mainUsed=true;
    assess(n,cmd.id);return {ok:true,state:n,events:n.events.slice(state.events.length),paused:n.phase==='REACTION_PENDING'};
  }else return error(state,'UNSUPPORTED_COMMAND');
  s.revision++;s.committedCommands.push(cmd.id);return {ok:true,state:s,events:s.events.slice(state.events.length),paused:false};
}
