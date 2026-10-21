/** C4: deterministic, knowledge-limited tactical decision advisor. No state mutations. */
import {reachable,hexDistance} from './battle-core.mjs';
import {validateAttack} from './battle-combat.mjs';
const live=u=>u.soldiers>0&&!u.routed&&!u.withdrawn;
const compare=(a,b)=>b.score-a.score||a.key.localeCompare(b.key);
export function legalAiActions(state,side){
  if(state.phase!=='ACTIVE'||state.activation)return [];
  if(state.nextSide!==side)return [];
  const own=state.units.filter(u=>u.side===side&&live(u)&&!u.activatedThisRound);
  return own.map(u=>({type:'ACTIVATE_UNIT',unitId:u.id,side,score:u.soldiers/500,key:`activate:${u.id}`})).sort(compare);
}
/** A side's knowledge must contain only visible enemies; caller cannot pass hidden true state. */
export function chooseAiActivation(state,side,knowledge){
  if(!knowledge||knowledge.side!==side||!Array.isArray(knowledge.visibleEnemyIds))throw Error('INVALID_KNOWLEDGE');
  const actions=legalAiActions(state,side);const visible=new Set(knowledge.visibleEnemyIds);
  const targets=state.units.filter(u=>u.side!==side&&live(u)&&visible.has(u.id));
  const ranked=actions.map(a=>{const u=state.units.find(x=>x.id===a.unitId);
    const canAttack=targets.some(t=>validateAttack(state,u.id,t.id).ok);
    const nearest=targets.length?Math.min(...targets.map(t=>hexDistance(u,t))):Infinity;
    return {...a,score:(canAttack?100:0)+a.score*10+(Number.isFinite(nearest)?1/(nearest+1):0)};
  }).sort(compare);
  return ranked[0]??null;
}
export function suggestAiMove(state,unitId,knowledge){
  const u=state.units.find(x=>x.id===unitId);
  if(!u||!live(u)||knowledge?.side!==u.side||!Array.isArray(knowledge.visibleEnemyIds))return null;
  const ids=new Set(knowledge.visibleEnemyIds),targets=state.units.filter(x=>x.side!==u.side&&live(x)&&ids.has(x.id));
  if(!targets.length)return null;
  const moves=reachable(u,state);const ranked=moves.map(m=>({...m,nearest:Math.min(...targets.map(t=>hexDistance(m.hex,t)))}))
    .sort((a,b)=>a.nearest-b.nearest||a.cost-b.cost||a.hex.r-b.hex.r||a.hex.q-b.hex.q);
  const current=Math.min(...targets.map(t=>hexDistance(u,t)));
  return ranked.length&&ranked[0].nearest<current?{type:'MOVE_UNIT',unitId,path:ranked[0].path,side:u.side}:null;
}
