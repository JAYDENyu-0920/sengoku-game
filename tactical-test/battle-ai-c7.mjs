/** C7: bounded, deterministic action advisor. Only visible enemy snapshots may be used. */
import {weatherRule} from './battle-weather.mjs';
import {hexDistance, reachable} from './battle-core.mjs';
import {RANGE,lineOfSight} from './battle-combat.mjs';
const live=u=>u.soldiers>0&&!u.routed&&!u.withdrawn;
const key=h=>`${h.q},${h.r}`;
function validateKnowledge(side,k){
  if(!k||k.side!==side||!Array.isArray(k.visibleEnemies))throw Error('INVALID_KNOWLEDGE');
  const ids=new Set();
  for(const e of k.visibleEnemies){
    if(!e||typeof e.id!=='string'||ids.has(e.id)||e.side===side||!Number.isInteger(e.q)||!Number.isInteger(e.r)||!Number.isInteger(e.soldiers)||e.soldiers<0)throw Error('INVALID_KNOWLEDGE');
    ids.add(e.id);
  }
}
const rangeFor=(t,state)=>t==='gun'?[2,weatherRule(state).gunMax]:RANGE[t]??[0,0];
function threatAt(hex,enemies,state){return enemies.reduce((v,e)=>{
  if(!live(e))return v;
  const d=hexDistance(hex,e),[min,max]=rangeFor(e.type,state);
  return v+(d>=min&&d<=max?Math.min(1,e.soldiers/500):0);
},0);}
/** No hidden state read: target choices come exclusively from knowledge.visibleEnemies. */
export function planAiActivation(state,side,knowledge,{difficulty='normal'}={}){
  validateKnowledge(side,knowledge);
  if(!['easy','normal','hard'].includes(difficulty))throw Error('INVALID_DIFFICULTY');
  if(state.phase!=='ACTIVE'||state.nextSide!==side||state.activation)return null;
  const enemies=knowledge.visibleEnemies.filter(live);
  const candidates=[];
  for(const u of state.units.filter(u=>u.side===side&&live(u)&&!u.activatedThisRound)){
    const attackTargets=enemies.filter(e=>{const d=hexDistance(u,e),[lo,hi]=rangeFor(u.type,state);return d>=lo&&d<=hi&&(u.type!=='gun'||(u.gunState!=='UNLOADED'&&!u.movedThisActivation))&&(d===1||lineOfSight(state.map,u,e,[...state.units.filter(x=>x.side===side),...enemies]));});
    for(const target of attackTargets)candidates.push({unitId:u.id,side,action:'ATTACK_UNIT',targetId:target.id,score:100+Math.min(500,target.soldiers)/50-threatAt(u,enemies,state)*3,detail:'range-candidate'});
    const moves=reachable(u,state).filter(m=>m.path?.length).sort((a,b)=>a.cost-b.cost||a.hex.r-b.hex.r||a.hex.q-b.hex.q);
    const base=enemies.length?Math.min(...enemies.map(e=>hexDistance(u,e))):Infinity;
    for(const m of moves){
      const nearest=enemies.length?Math.min(...enemies.map(e=>hexDistance(m.hex,e))):Infinity;
      const advance=Number.isFinite(base)?base-nearest:0;
      if(advance<=0)continue;
      const danger=threatAt(m.hex,enemies,state);
      const penalty=difficulty==='easy'?0:difficulty==='normal'?3:6;
      candidates.push({unitId:u.id,side,action:'MOVE_UNIT',path:m.path,score:10+advance*4-m.cost*.2-danger*penalty,detail:'move-candidate'});
    }
    candidates.push({unitId:u.id,side,action:'END_ACTIVATION',score:0,detail:'fallback'});
  }
  candidates.sort((a,b)=>b.score-a.score||a.unitId.localeCompare(b.unitId)||a.action.localeCompare(b.action)||String(a.targetId??key(a.path?.at(-1)??{q:0,r:0})).localeCompare(String(b.targetId??key(b.path?.at(-1)??{q:0,r:0}))));
  return candidates[0]??null;
}
/** Convert selected plan to the first valid command. Further commands require a fresh state/revision. */
export function aiFirstCommand(plan,state,commandId){
  if(!plan)return null;
  if(!commandId||typeof commandId!=='string')throw Error('INVALID_COMMAND_ID');
  if(state.phase!=='ACTIVE'||state.activation||state.nextSide!==plan.side)throw Error('INVALID_AI_TURN');
  const unit=state.units.find(u=>u.id===plan.unitId&&u.side===plan.side&&!u.activatedThisRound&&live(u));
  if(!unit)throw Error('INVALID_AI_UNIT');
  return {id:commandId,type:'ACTIVATE_UNIT',unitId:unit.id,side:plan.side,expectedRevision:state.revision};
}
/** Tactical report, without classifying temporary combat losses as permanent killed/wounded. */
export function tacticalReport(state){
  if(!Array.isArray(state.units))throw Error('INVALID_BATTLE');
  return Object.freeze({round:state.round??null,phase:state.phase,result:state.result?structuredClone(state.result):null,
    units:state.units.map(u=>({unitId:u.id,side:u.side,initial:u.initialSoldiers??u.soldiers,remaining:u.soldiers,
      temporarilyOutOfAction:Math.max(0,(u.initialSoldiers??u.soldiers)-u.soldiers),routed:!!u.routed,withdrawn:!!u.withdrawn}))});
}
