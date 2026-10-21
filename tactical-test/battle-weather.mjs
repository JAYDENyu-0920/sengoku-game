/** D8-A2.3: fixed battle weather and automatic gun reload. */
export const WEATHER=Object.freeze({sun:{name:'晴天',gunMax:4,reloadRounds:0},cloud:{name:'陰天',gunMax:4,reloadRounds:0},rain:{name:'雨天',gunMax:3,reloadRounds:1},fog:{name:'濃霧',gunMax:2,reloadRounds:1}});
export function weatherRule(state){return WEATHER[state.weather]??WEATHER.sun;}
export function gunRangeModifier(distance){return ({2:1.3,3:1.1,4:.9})[distance]??1;}
export function gunReady(unit){return (unit.gunReloadUntilRound??0)<=0;}
export function reloadAtRoundStart(state){for(const u of state.units){if(u.type!=='gun')continue;if((u.gunReloadUntilRound??0)>0&&state.round>=u.gunReloadUntilRound){u.gunReloadUntilRound=0;u.gunState='READY';state.events.push({sequence:state.events.length+1,commandId:'round-auto',type:'GUN_AUTO_RELOADED',unitId:u.id});}}}
