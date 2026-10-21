/** C5 pure officer/proficiency damage modifiers; no state mutation or RNG. */
const LEVEL={E:0,D:1,C:2,B:3,A:4};
const finite=(v)=>typeof v==='number'&&Number.isFinite(v);
export function validateOfficer(o){
  if(!o||!Number.isInteger(o.level)||o.level<1||o.level>20)throw Error('INVALID_OFFICER_LEVEL');
  for(const k of ['leadership','valor','intellect','politics'])if(!finite(o[k])||o[k]<0||o[k]>100)throw Error('INVALID_OFFICER_STAT');
  if(!(o.proficiency in LEVEL))throw Error('INVALID_PROFICIENCY');
  return true;
}
/** Neutral stat 50 = 1.0; bounded multipliers are C5 provisional balance values. */
export function officerModifiers(attacker,defender){
  validateOfficer(attacker);validateOfficer(defender);
  const attack=1+(attacker.valor-50)*0.004+(attacker.leadership-50)*0.002+LEVEL[attacker.proficiency]*0.015;
  const defense=1+(defender.leadership-50)*0.004+(defender.valor-50)*0.001+LEVEL[defender.proficiency]*0.015;
  return {attack,defense,ratio:attack/defense};
}
export function applyOfficerDamage(base,attacker,defender){
  if(!finite(base)||base<0)throw Error('INVALID_DAMAGE');
  return Math.max(0,Math.floor(base*officerModifiers(attacker,defender).ratio));
}
