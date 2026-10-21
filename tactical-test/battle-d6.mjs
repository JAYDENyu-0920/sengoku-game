/** D6 UI estimates mirror the current provisional C2 damage formula. No RNG consumed. */
import {validateAttack,ATTACK,DEFENSE} from './battle-combat.mjs';
import {matchupModifier,matchupLabel} from './battle-matchups.mjs';
import {officerModifiers} from './battle-officers.mjs';
import {attackCardModifier} from './battle-card-effects.mjs';
export function estimateAttack(state,attackerId,targetId){
  const check=validateAttack(state,attackerId,targetId);
  if(!check.ok)return {ok:false,error:check.error};
  const {attacker:a,target:b}=check;
  const officer=(state.officers?.[a.id]&&state.officers?.[b.id])?officerModifiers(state.officers[a.id],state.officers[b.id]).ratio:1;
  const cards=state.cardLoadouts?.[a.side]?attackCardModifier(state.cardLoadouts[a.side],a.type):1;
  const raw=50*(state.damageScale??1)*ATTACK[a.type]*Math.sqrt(a.soldiers/500)/DEFENSE[b.type]*officer*cards*matchupModifier(a.type,b.type);
  const low=Math.min(b.soldiers,Math.max(0,Math.floor(raw*.9)));
  const high=Math.min(b.soldiers,Math.max(0,Math.floor(raw*1.1)));
  return {ok:true,min:low,max:high,remainingMin:Math.max(0,b.soldiers-high),remainingMax:Math.max(0,b.soldiers-low),matchup:matchupLabel(a.type,b.type)};
}
/** Select from already legally attackable visible targets. Commander priority and finishing blows. */
export function chooseAiTarget(state,attackerId,visibleIds){
  const attacker=state.units.find(u=>u.id===attackerId);
  if(!attacker)return null;
  return state.units.filter(u=>visibleIds.includes(u.id)&&u.side!==attacker.side&&validateAttack(state,attackerId,u.id).ok)
    .map(u=>{const e=estimateAttack(state,attackerId,u.id);return {id:u.id,score:(state.commanders?.[u.side]===u.id?50:0)+(e.max>=u.soldiers?90:0)+Math.min(e.min,u.soldiers)*.4+(100-u.morale)*.25};})
    .sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))[0]?.id??null;
}
