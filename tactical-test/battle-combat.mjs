/** B1 V4.0-C2: deterministic combat and single-choice reaction windows. No overworld mutations. */
import {hexDistance, getCell, seedRng, nextRng, validatePath, stepCost} from './battle-core.mjs';
import {officerModifiers} from './battle-officers.mjs';
import {attackCardModifier} from './battle-card-effects.mjs';
import {matchupModifier} from './battle-matchups.mjs';
import {weatherRule,gunRangeModifier} from './battle-weather.mjs';
export const RANGE=Object.freeze({spear:[1,1],cavalry:[1,1],bow:[2,3],gun:[2,4]});
export const ATTACK=Object.freeze({spear:1,cavalry:1.15,bow:.9,gun:1.25});
export const DEFENSE=Object.freeze({spear:1.15,cavalry:1,bow:.8,gun:.75});
const position=u=>({q:u.q,r:u.r});
const cube=h=>({x:h.q,z:h.r,y:-h.q-h.r});
const roundCube=(x,y,z)=>{let rx=Math.round(x),ry=Math.round(y),rz=Math.round(z);const dx=Math.abs(rx-x),dy=Math.abs(ry-y),dz=Math.abs(rz-z);if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;return {q:rx,r:rz};};
function lineWithBias(a,b,bias){const n=hexDistance(a,b),ca=cube(a),cb=cube(b),out=[];for(let i=1;i<n;i++){const t=i/n;out.push(roundCube(ca.x+(cb.x-ca.x)*t+bias,ca.y+(cb.y-ca.y)*t+bias,ca.z+(cb.z-ca.z)*t-2*bias));}return out;}
export function lineOfSight(map,a,b,units=[]){const n=hexDistance(a,b);if(!Number.isInteger(n)||n<1)return false;
  // Conservative symmetric supercover: check both sides of ambiguous grid edges.
  for(const bias of [-1e-7,1e-7])for(const h of lineWithBias(a,b,bias)){
    const cell=getCell(map,h);if(!cell||cell.blocksLos||cell.terrain==='forest')return false;
    if(cell.terrain==='mountain'&&cell.elevation>=Math.max(getCell(map,a)?.elevation??0,getCell(map,b)?.elevation??0))return false;
    if(units.some(u=>u.soldiers>0&&!u.withdrawn&&u.q===h.q&&u.r===h.r))return false;
  }return true;
}
export function validateAttack(state,attackerId,targetId){const a=state.units.find(u=>u.id===attackerId),b=state.units.find(u=>u.id===targetId);
  if(!a||!b)return {ok:false,error:'UNKNOWN_UNIT'};
  if(a.side===b.side)return {ok:false,error:'FRIENDLY_FIRE'};
  if(a.soldiers<=0||b.soldiers<=0||a.routed||a.withdrawn||b.withdrawn)return {ok:false,error:'INACTIVE_UNIT'};
  const d=hexDistance(a,b),range=a.type==='gun'?[2,weatherRule(state).gunMax]:RANGE[a.type];if(!range||d<range[0]||d>range[1])return {ok:false,error:'OUT_OF_RANGE'};
  if(a.type==='gun'&&((a.gunReloadUntilRound??0)>0||(a.gunState??'READY')!=='READY'))return {ok:false,error:'GUN_UNLOADED'};
  if(a.type==='gun'&&a.movedThisActivation)return {ok:false,error:'GUN_MOVED'};
  if(d>1&&!lineOfSight(state.map,a,b,state.units))return {ok:false,error:'LOS_BLOCKED'};
  return {ok:true,attacker:a,target:b};
}
export function moraleState(m){return m<20?'ROUTED':m<40?'CONFUSED':m<70?'SHAKEN':'NORMAL';}
export function createCombatBattle(snapshot){const {map,units,seed}=snapshot;if(!map||!Array.isArray(units)||units.length>16)throw Error('INVALID_SNAPSHOT');
  const seen=new Set();for(const u of units){if(!RANGE[u.type]||!Number.isInteger(u.soldiers)||u.soldiers<1||u.soldiers>500||!getCell(map,u)||seen.has(u.id))throw Error('INVALID_UNIT');seen.add(u.id);}
  return {weather:weatherRule(snapshot).name==='晴天'?'sun':snapshot.weather??'sun',officers:structuredClone(snapshot.officers??{}),cardLoadouts:structuredClone(snapshot.cardLoadouts??{}),damageScale:snapshot.damageScale??1,map:structuredClone(map),units:structuredClone(units).map(u=>({...u,morale:u.morale??80,reactionUsed:false,...(u.type==='gun'?{gunState:u.gunState??'READY',gunReloadUntilRound:u.gunReloadUntilRound??0}:{}),movedThisActivation:false})),rng:{combat:seedRng(`${seed}:combat`)},revision:0,events:[],committedCommands:[],pending:null,phase:'ACTIVE'};
}
function record(s,id,type,data){s.events.push({sequence:s.events.length+1,commandId:id,type,...data});}
function resolveAttack(s,commandId,attackerId,targetId,kind='NORMAL'){
  const valid=validateAttack(s,attackerId,targetId);if(!valid.ok)return {ok:false,error:valid.error};
  const a=valid.attacker,b=valid.target;const roll=nextRng(s.rng.combat);s.rng.combat=roll.rng;
  const attack=ATTACK[a.type],defense=DEFENSE[b.type];
  // C2 neutral-baseline formula: officer, terrain, facing and tactics multipliers are integration hooks.
  const officerRatio=(s.officers?.[a.id]&&s.officers?.[b.id])?officerModifiers(s.officers[a.id],s.officers[b.id]).ratio:1;
  const cardRatio=s.cardLoadouts?.[a.side]?attackCardModifier(s.cardLoadouts[a.side],a.type):1;
  const raw=50*(s.damageScale??1)*attack*Math.sqrt(a.soldiers/500)/defense*officerRatio*cardRatio*(1+(s.skillBonus??0))*((b.guardUntilRound??0)>=(s.round??1)? .8:1)*matchupModifier(a.type,b.type)*(a.type==='gun'?gunRangeModifier(hexDistance(a,b)):1)*(.9+roll.value*.2);
  const loss=Math.min(b.soldiers,Math.max(0,Math.floor(raw)));
  b.soldiers-=loss;b.morale=Math.max(0,b.morale-Math.floor(loss/10));b.routed=b.morale<20;
  if(a.type==='gun'){a.gunState='UNLOADED';a.gunReloadUntilRound=(s.round??1)+1+weatherRule(s).reloadRounds;}
  record(s,commandId,'ATTACK_RESOLVED',{attackerId,targetId,kind,loss,remaining:b.soldiers,morale:b.morale,rngState:s.rng.combat.state});
  if(b.routed)record(s,commandId,'UNIT_ROUTED',{unitId:b.id});
  return {ok:true};
}
function candidateReactions(s,mover,to){return s.units.filter(u=>u.side!==mover.side&&u.soldiers>0&&!u.withdrawn&&!u.routed&&!u.reactionUsed)
  .filter(u=>{const proxy={...mover,q:to.q,r:to.r};return validateAttack({...s,units:s.units.map(x=>x.id===mover.id?proxy:x)},u.id,mover.id).ok;})
  .map(u=>({unitId:u.id,targetId:mover.id,type:'OVERWATCH'})).sort((a,b)=>a.unitId.localeCompare(b.unitId));}
function moveUntilReaction(s,id){const pending=s.pending;const u=s.units.find(x=>x.id===pending.unitId);
  while(pending.index<pending.path.length){const to=pending.path[pending.index];const cost=stepCost(u,position(u),to,s);if(!Number.isFinite(cost)||pending.spent+cost>pending.budget)return {ok:false,error:'PATH_INVALIDATED'};
    if(s.units.some(x=>x.id!==u.id&&x.soldiers>0&&!x.withdrawn&&x.q===to.q&&x.r===to.r))return {ok:false,error:'OCCUPIED'};
    const from=position(u);u.q=to.q;u.r=to.r;u.movedThisActivation=true;pending.spent+=cost;pending.index++;
    record(s,id,'UNIT_STEP',{unitId:u.id,from,to,spent:pending.spent});
    const candidates=candidateReactions(s,u,to);if(candidates.length){pending.window={id:`reaction:${id}:${pending.index}`,candidates};s.phase='REACTION_PENDING';record(s,id,'REACTION_OPENED',{windowId:pending.window.id,candidates});return {ok:true,paused:true};}
  }s.pending=null;s.phase='ACTIVE';record(s,id,'MOVE_FINISHED',{unitId:u.id});return {ok:true,paused:false};
}
export function combatDispatch(state,cmd){
  if(state.committedCommands.includes(cmd.id))return {ok:true,state,duplicate:true};
  if(cmd.expectedRevision!==state.revision)return {ok:false,error:'STALE_REVISION',state};
  const s=structuredClone(state);let result;
  if(s.phase==='REACTION_PENDING'){
    if(!['CHOOSE_REACTION','PASS_REACTION'].includes(cmd.type))return {ok:false,error:'REACTION_REQUIRED',state};
    if(cmd.windowId!==s.pending.window.id)return {ok:false,error:'STALE_WINDOW',state};
    if(cmd.type==='CHOOSE_REACTION'){
      const candidate=s.pending.window.candidates.find(c=>c.unitId===cmd.unitId);if(!candidate)return {ok:false,error:'INVALID_REACTION',state};
      const actor=s.units.find(u=>u.id===cmd.unitId);actor.reactionUsed=true;
      // Reaction attacks resolve against mover's current position, not a preview position.
      result=resolveAttack(s,cmd.id,cmd.unitId,candidate.targetId,'REACTION');if(!result.ok)return {ok:false,error:result.error,state};
      record(s,cmd.id,'REACTION_SELECTED',{unitId:cmd.unitId,windowId:cmd.windowId});
    }else record(s,cmd.id,'REACTION_PASSED',{windowId:cmd.windowId});
    s.pending.window=null;s.phase='ACTIVE';
    const mover=s.units.find(u=>u.id===s.pending.unitId);
    if(mover.routed||mover.soldiers===0||Object.values(s.commanders??{}).some(cid=>{const commander=s.units.find(u=>u.id===cid);return commander&&(commander.routed||commander.soldiers<=0);})){record(s,cmd.id,'MOVE_INTERRUPTED',{unitId:mover.id});s.pending=null;}
    else result=moveUntilReaction(s,cmd.id);
  }else if(cmd.type==='ATTACK_UNIT'){s.skillBonus=cmd.skillBonus??0;result=resolveAttack(s,cmd.id,cmd.unitId,cmd.targetId);delete s.skillBonus;}
  else if(cmd.type==='RELOAD_GUN')return {ok:false,error:'AUTO_RELOAD_ENABLED',state};else if(cmd.type==='MOVE_UNIT'){
    const u=s.units.find(u=>u.id===cmd.unitId);if(!u)return {ok:false,error:'UNKNOWN_UNIT',state};
    const check=validatePath(u,cmd.path,s);if(!check.ok)return {ok:false,error:check.reason,state};
    s.pending={unitId:u.id,path:structuredClone(cmd.path),index:0,spent:0,budget:check.cost};
    // Budget uses actual movement allowance; prevalidated path may be interrupted by reactions.
    s.pending.budget=({spear:3,cavalry:5,bow:3,gun:2})[u.type];result=moveUntilReaction(s,cmd.id);
  }else return {ok:false,error:'UNSUPPORTED_COMMAND',state};
  if(!result.ok)return {ok:false,error:result.error,state};
  s.revision++;s.committedCommands.push(cmd.id);return {ok:true,state:s,events:s.events.slice(state.events.length),paused:s.phase==='REACTION_PENDING'};
}
