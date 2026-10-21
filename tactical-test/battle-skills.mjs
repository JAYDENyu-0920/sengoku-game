/** D8-A2 battle skills: deterministic rules and shared orders. */
export const SKILLS=Object.freeze({
 charge:{id:'charge',name:'騎馬突擊',type:'cavalry',cost:2,bonus:.25,kind:'attack'},
 volley:{id:'volley',name:'齊射',type:'bow',cost:2,bonus:.20,kind:'attack'},
 phalanx:{id:'phalanx',name:'槍衾',type:'spear',cost:1,reduction:.30,kind:'reaction'},
 guard:{id:'guard',name:'堅守',cost:1,reduction:.20,kind:'stance'}
});
export const START_ORDERS=3,MAX_ORDERS=5,ROUND_RECOVERY=2;
export function availableSkills(unit){return Object.values(SKILLS).filter(s=>!s.type||s.type===unit.type);}
export function checkSkill(state,cmd){
 const skill=SKILLS[cmd.skillId],unit=state.units.find(u=>u.id===cmd.unitId);
 if(!skill||!unit)return {ok:false,error:'UNKNOWN_SKILL'};
 if(skill.type&&unit.type!==skill.type)return {ok:false,error:'WRONG_SKILL_TYPE'};
 if((state.orders?.[unit.side]??0)<skill.cost)return {ok:false,error:'INSUFFICIENT_ORDERS'};
 if(skill.kind==='attack'&&(!cmd.targetId||skill.id==='charge'&&!unit.movedThisActivation))return {ok:false,error:skill.id==='charge'?'CHARGE_REQUIRES_MOVE':'TARGET_REQUIRED'};
 return {ok:true,skill,unit};
}
