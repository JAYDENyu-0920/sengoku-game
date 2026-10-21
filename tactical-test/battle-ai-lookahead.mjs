/** C5 bounded two-ply activation advisor: own activation -> plausible enemy activation.
 * Uses only caller supplied redacted visible enemy snapshots. Never reads hidden enemies.
 */
import {hexDistance} from './battle-core.mjs';
const alive=u=>u.soldiers>0&&!u.routed&&!u.withdrawn;
const score=(own,enemy)=>{
  const near=enemy.length?Math.min(...enemy.map(e=>hexDistance(own,e))):6;
  const threat=enemy.reduce((n,e)=>n+(hexDistance(own,e)<=2?e.soldiers/500:0),0);
  return own.soldiers/500*10+1/(near+1)*5-threat*2;
};
export function chooseTwoPlyActivation(state,side,knowledge){
  if(!knowledge||knowledge.side!==side||!Array.isArray(knowledge.visibleEnemies))throw Error('INVALID_KNOWLEDGE');
  if(state.phase!=='ACTIVE'||state.activation||state.nextSide!==side)return null;
  const own=state.units.filter(u=>u.side===side&&alive(u)&&!u.activatedThisRound);
  // Caller supplies redacted visible snapshots, never identifiers to fetch from state.
  const enemy=knowledge.visibleEnemies.map(e=>({...e})).filter(alive);
  if(enemy.some(e=>e.side===side||!Number.isInteger(e.q)||!Number.isInteger(e.r)))throw Error('INVALID_KNOWLEDGE');
  const ranked=own.map(u=>{
    const immediate=score(u,enemy);
    const worstReply=enemy.length?Math.max(...enemy.map(e=>1/(hexDistance(u,e)+1)*e.soldiers/500)):0;
    return {type:'ACTIVATE_UNIT',unitId:u.id,side,score:immediate-worstReply*2};
  }).sort((a,b)=>b.score-a.score||a.unitId.localeCompare(b.unitId));
  return ranked[0]??null;
}
