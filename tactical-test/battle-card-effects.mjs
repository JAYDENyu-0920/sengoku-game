/** C5 first-stage tactical card effects. Provisional caps, no permanent state writes. */
import {CARD_POOL} from './battle-tactics.mjs';
const CARD_IDS=new Set(CARD_POOL.map(c=>c.id));
export const LEVEL_BONUS=Object.freeze({1:0.05,2:0.08,3:0.10});
export function validateCardLoadout(loadout){
  if(!Array.isArray(loadout))throw Error('INVALID_LOADOUT');
  const seen=new Set();
  for(const c of loadout){
    if(!CARD_IDS.has(c.id)||![1,2,3].includes(c.level)||seen.has(c.id))throw Error('INVALID_CARD');
    seen.add(c.id);
  }
  return true;
}
export function upgradeCard(loadout,id){
  validateCardLoadout(loadout);
  const card=loadout.find(c=>c.id===id);if(!card)throw Error('CARD_NOT_OWNED');
  if(card.level>=3)throw Error('MAX_CARD_LEVEL');
  return loadout.map(c=>c.id===id?{...c,level:c.level+1}:{...c});
}
/** Effects apply to attacks matching a card group; common cards are generic. */
export function attackCardModifier(loadout,troopType,{charge=false,ambush=false}={}){
  validateCardLoadout(loadout);
  let bonus=0;
  for(const c of loadout){
    const group=c.id.split('-')[0];
    if(group===troopType&&(['spear-5','cavalry-1','bow-1','gun-5'].includes(c.id)))bonus+=LEVEL_BONUS[c.level];
    if(c.id==='common-7'&&ambush)bonus+=LEVEL_BONUS[c.level];
  }
  // Existing B1 caps: ordinary +30%; cavalry charge + rogue <=35%; ambush <=30%.
  return 1+Math.min(bonus,charge&&troopType==='cavalry'?0.35:ambush?0.30:0.30);
}
