/** D3: local-only tentative movement. No engine state or fog events change before commit. */
export function stageMove(state,unitId,entry){
 if(state.phase!=='ACTIVE'||state.activation?.unitId!==unitId||state.activation.moved||state.activation.mainUsed)throw Error('PREVIEW_NOT_ALLOWED');
 if(!entry?.hex||!Array.isArray(entry.path)||!entry.path.length)throw Error('INVALID_PREVIEW_PATH');
 return {unitId,q:entry.hex.q,r:entry.hex.r,path:structuredClone(entry.path),revision:state.revision};
}
export function previewPosition(state,preview,unitId){const u=state.units.find(x=>x.id===unitId);return preview?.unitId===unitId&&preview.revision===state.revision?{...u,q:preview.q,r:preview.r}:u;}
export function canUndoPreview(state,preview){return !!preview&&preview.revision===state.revision&&state.phase==='ACTIVE'&&state.activation?.unitId===preview.unitId&&!state.activation.moved&&!state.activation.mainUsed;}
export function remainingUnits(state,side=state.activation?.side??state.nextSide){return state.units.filter(u=>u.side===side&&u.soldiers>0&&!u.routed&&!u.withdrawn&&!u.activatedThisRound).map(u=>u.id);}
