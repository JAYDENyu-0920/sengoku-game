/** D4: picking a unit is a UI-only decision, not a battle command. */
export function canSelectWithoutActivation(state,unitId,playerSide='attacker'){
 const u=state.units.find(x=>x.id===unitId);
 return !!u&&state.phase==='ACTIVE'&&!state.activation&&state.nextSide===playerSide&&u.side===playerSide&&u.soldiers>0&&!u.routed&&!u.withdrawn&&!u.activatedThisRound;
}
export function switchTentativeSelection(state,currentPreview,newUnitId,playerSide='attacker'){
 if(!canSelectWithoutActivation(state,newUnitId,playerSide))return {ok:false,preview:currentPreview};
 return {ok:true,selected:newUnitId,preview:null};
}
