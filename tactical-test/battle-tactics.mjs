/** C4: deterministic pre-battle card draft prototype, isolated from battle state. */
import {seedRng,nextRng} from './battle-core.mjs';
export const CARD_POOL=Object.freeze([
  ...['鼓舞','堅守','急行','偵察','整隊','補給','奇襲','應變'].map((name,i)=>({id:`common-${i+1}`,name,group:'common'})),
  ...Object.entries({spear:['槍衾','堅陣','迎擊','密集','奮戰'],cavalry:['突擊','迂迴','追擊','疾馳','騎射'],bow:['齊射','曲射','掩護','遠望','速射'],gun:['三段','裝填','火網','狙擊','齊發']}).flatMap(([group,names])=>names.map((name,i)=>({id:`${group}-${i+1}`,name,group})))
]);
export function draftThree(seed,availableGroups=['common','spear','cavalry','bow','gun']){
  const groups=new Set(availableGroups),pool=CARD_POOL.filter(c=>groups.has(c.group));
  if(pool.length<3)throw Error('NOT_ENOUGH_CARDS');
  let rng=seedRng(`tactic:${seed}`);const deck=[...pool],draw=[];
  for(let i=0;i<3;i++){const roll=nextRng(rng);rng=roll.rng;const index=Math.floor(roll.value*deck.length);draw.push(deck.splice(index,1)[0]);}
  return draw;
}
export function chooseCard(choices,id){if(!choices.some(c=>c.id===id))throw Error('CARD_NOT_OFFERED');return choices.find(c=>c.id===id);}
