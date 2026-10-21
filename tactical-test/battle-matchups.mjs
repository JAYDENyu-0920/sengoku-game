/** D5 provisional troop matchup rules; all modifiers are symmetric and bounded. */
export const MATCHUP_ADVANTAGE=1.15;
export const MATCHUP_DISADVANTAGE=0.90;
const counters=Object.freeze({spear:'cavalry',cavalry:'bow',bow:'spear'});
export const MATCHUP_HINTS=Object.freeze([
  Object.freeze({attacker:'spear',defender:'cavalry',label:'槍兵剋騎兵'}),
  Object.freeze({attacker:'cavalry',defender:'bow',label:'騎兵剋弓兵'}),
  Object.freeze({attacker:'bow',defender:'spear',label:'弓兵剋槍兵'}),
]);
export function matchupModifier(attackerType,defenderType){
  if(counters[attackerType]===defenderType)return MATCHUP_ADVANTAGE;
  if(counters[defenderType]===attackerType)return MATCHUP_DISADVANTAGE;
  return 1;
}
export function matchupLabel(attackerType,defenderType){
  const m=matchupModifier(attackerType,defenderType);
  return m>1?'相剋優勢':m<1?'相剋劣勢':'無相剋加成';
}
