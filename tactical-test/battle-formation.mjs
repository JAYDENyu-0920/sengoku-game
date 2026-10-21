/** D8-A1: pure prebattle formation validation and battle snapshot generation. */
export const SIZES=Object.freeze({skirmish:3,field:5,grand:8});
export const ROSTER=Object.freeze([
 {id:'a1',name:'織田信長',type:'gun'}, {id:'a2',name:'柴田勝家',type:'spear'},
 {id:'a3',name:'森可成',type:'bow'}, {id:'a4',name:'丹羽長秀',type:'cavalry'},
 {id:'a5',name:'佐久間信盛',type:'spear'}, {id:'a6',name:'滝川一益',type:'gun'},
 {id:'a7',name:'前田利家',type:'cavalry'}, {id:'a8',name:'池田恒興',type:'bow'}
]);
export const DEFENDERS=Object.freeze([
 {id:'d1',name:'今川義元',type:'spear'}, {id:'d2',name:'岡部元信',type:'gun'},
 {id:'d3',name:'朝比奈泰朝',type:'bow'}, {id:'d4',name:'鵜殿長照',type:'cavalry'},
 {id:'d5',name:'松井宗信',type:'spear'}, {id:'d6',name:'井伊直盛',type:'bow'},
 {id:'d7',name:'瀬名氏俊',type:'cavalry'}, {id:'d8',name:'関口氏純',type:'gun'}
]);
const slotsA=[[1,4],[1,6],[1,2],[2,8],[2,0],[0,7],[0,1],[2,5]];
const slotsD=[[8,4],[8,6],[8,2],[7,8],[7,0],[9,7],[9,1],[7,5]];
export function validateFormation(formation){
 const size=SIZES[formation?.size];if(!size)return {ok:false,error:'不支援的戰役規模'};
 const ids=formation?.officers;if(!Array.isArray(ids)||ids.length!==size||new Set(ids).size!==size)return {ok:false,error:`必須配置 ${size} 名不重複武將`};
 if(ids.some(id=>!ROSTER.some(o=>o.id===id)))return {ok:false,error:'包含不存在的武將'};
 if(!ids.includes(formation.commander))return {ok:false,error:'總大將必須在出陣名單中'};
 return {ok:true};
}
export function buildFormationSnapshot(base,formation){
 const valid=validateFormation(formation);if(!valid.ok)throw Error(valid.error);
 const size=SIZES[formation.size];const make=(officer,side,index,slots)=>({id:officer.id,side,type:officer.type,q:slots[index][0],r:slots[index][1],soldiers:500,morale:80});
 const attacker=formation.officers.map((id,i)=>make(ROSTER.find(o=>o.id===id),'attacker',i,slotsA));
 const defender=DEFENDERS.slice(0,size).map((o,i)=>make(o,'defender',i,slotsD));
 return {...base,seed:`D8-A1-${formation.size}`,units:[...attacker,...defender],commanders:{attacker:formation.commander,defender:defender[0].id}};
}
