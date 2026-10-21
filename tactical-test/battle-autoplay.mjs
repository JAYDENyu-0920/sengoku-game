/** C8 headless deterministic AI battle driver. No strategic state writes. */
import {turnDispatch} from './battle-turns.mjs';
import {planAiActivation} from './battle-ai-c7.mjs';
import {validateAttack} from './battle-combat.mjs';
import {hexDistance,reachable} from './battle-core.mjs';
const alive=u=>u.soldiers>0&&!u.routed&&!u.withdrawn;
export function visibleKnowledge(state,side,{visibleIds=null}={}){
  const allowed=visibleIds===null?null:new Set(visibleIds);
  return {side,visibleEnemies:state.units.filter(u=>u.side!==side&&alive(u)&&(allowed===null||allowed.has(u.id))).map(u=>({id:u.id,side:u.side,type:u.type,q:u.q,r:u.r,soldiers:u.soldiers,morale:u.morale,routed:!!u.routed,withdrawn:!!u.withdrawn}))};
}
export function runAutoBattle(snapshotOrState,{maxCommands=1500,difficulty='normal',knowledgeProvider=visibleKnowledge,trace=true}={}){
  if(!Number.isInteger(maxCommands)||maxCommands<1)throw Error('INVALID_MAX_COMMANDS');
  let state=structuredClone(snapshotOrState),issued=0;const commands=[];let stopped=null;
  while(state.phase!=='TACTICAL_FINISHED'&&issued<maxCommands){
    const side=state.phase==='REACTION_PENDING' ? state.units.find(u=>u.id===state.pending?.window?.candidates?.[0]?.unitId)?.side : state.activation?.side??state.nextSide;
    if(!side){stopped='NO_ACTOR';break;}
    const id=`c8-${String(issued+1).padStart(5,'0')}`;
    const base={id,side,expectedRevision:state.revision};let cmd;
    if(state.phase==='REACTION_PENDING'){
      // Preserve reaction allowance by default. Future AI can score one eligible reaction.
      cmd={...base,type:'PASS_REACTION',windowId:state.pending.window.id};
    }else if(state.activation){
      const unit=state.units.find(u=>u.id===state.activation.unitId);
      const enemies=knowledgeProvider(state,side).visibleEnemies;
      const target=(!state.activation.mainUsed&&unit&&alive(unit))?enemies.find(e=>validateAttack(state,unit.id,e.id).ok):null;
      if(target)cmd={...base,type:'ATTACK_UNIT',unitId:unit.id,targetId:target.id};
      else if(unit?.type==='gun'&&unit.gunState==='UNLOADED'&&!state.activation.mainUsed&&!state.activation.moved)cmd={...base,type:'RELOAD_GUN',unitId:unit.id};
      else if(unit&&!state.activation.moved&&enemies.length){
        const oldDistance=Math.min(...enemies.map(e=>hexDistance(unit,e)));
        const options=reachable(unit,state).filter(m=>m.path?.length).map(m=>({...m,nearest:Math.min(...enemies.map(e=>hexDistance(m.hex,e)))}))
          .filter(m=>m.nearest<oldDistance).sort((a,b)=>a.nearest-b.nearest||a.cost-b.cost||a.hex.r-b.hex.r||a.hex.q-b.hex.q);
        cmd=options.length?{...base,type:'MOVE_UNIT',unitId:unit.id,path:options[0].path}:{...base,type:'END_ACTIVATION'};
      }else cmd={...base,type:'END_ACTIVATION'};
    }else{
      const knowledge=knowledgeProvider(state,side);
      const plan=planAiActivation(state,side,knowledge,{difficulty});
      if(!plan){stopped='NO_LEGAL_ACTIVATION';break;}
      cmd={...base,type:'ACTIVATE_UNIT',unitId:plan.unitId};
    }
    const result=turnDispatch(state,cmd);
    if(!result.ok){stopped=`COMMAND_REJECTED:${result.error}`;break;}
    state=result.state;issued++;
    if(trace)commands.push({command:cmd,eventTypes:(result.events??[]).map(e=>e.type)});
  }
  if(state.phase!=='TACTICAL_FINISHED'&&!stopped)stopped='COMMAND_LIMIT';
  return {state,finished:state.phase==='TACTICAL_FINISHED',stopped,issued,commands};
}
