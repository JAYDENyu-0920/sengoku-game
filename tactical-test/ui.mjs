import {makeMap,reachable,hexDistance} from './battle-core.mjs';
import {createTurnBattle,turnDispatch} from './battle-turns.mjs';
import {validateAttack} from './battle-combat.mjs';
import {stageMove,previewPosition,canUndoPreview,remainingUnits} from './battle-preview.mjs';
import {planAiActivation} from './battle-ai-c7.mjs';
import {visibleKnowledge} from './battle-autoplay.mjs';
import {canSelectWithoutActivation} from './battle-d4.mjs';
import {matchupLabel} from './battle-matchups.mjs';
import {estimateAttack,chooseAiTarget} from './battle-d6.mjs';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const labels={spear:'槍足輕',cavalry:'騎馬隊',bow:'弓足輕',gun:'鐵砲隊'};
const names={a1:'織田信長',a2:'柴田勝家',a3:'森可成',d1:'今川義元',d2:'岡部元信',d3:'朝比奈泰朝'};
const unit=(id,side,type,q,r)=>({id,side,type,q,r,soldiers:500,morale:80});
const map=makeMap(10,10);
for(let r=0;r<10;r++)for(let q=0;q<10;q++){
  const cell=map.cells[`${q},${r}`];
  if((q===4&&r>=1&&r<=3)||(q===6&&r>=6&&r<=8))cell.terrain='forest';
  if((q===5&&r===1)||(q===4&&r===7)||(q===5&&r===7))cell.terrain='hill';
  if(q===5&&r===8)cell.terrain='mountain';
}
const initial={map,seed:'D2-FAST-01',damageScale:2.7,units:[unit('a1','attacker','spear',1,4),unit('a2','attacker','cavalry',1,6),unit('a3','attacker','bow',1,2),unit('d1','defender','spear',8,4),unit('d2','defender','gun',8,6),unit('d3','defender','bow',8,2)],commanders:{attacker:'a1',defender:'d1'},objectives:[{id:'central',q:5,r:4}],exits:{attacker:[{id:'west',q:0,r:4}],defender:[{id:'east',q:9,r:4}]}};
let state,selected=null,mode=null,commandNumber=0,logLines=[],pendingTarget=null,preview=null,aiBusy=false,aiScheduled=false;
let effects=[];
function showDamage(events){for(const e of events??[]){if(e.type!=='ATTACK_RESOLVED')continue;const target=unitById(e.targetId);if(!target)continue;const {x,y}=xy(target.q,target.r);const svg=$('map');const t=svgEl('text',{x,y:y-27,class:'damage-float'},svg);t.textContent=`-${e.loss}`;setTimeout(()=>t.remove(),850);}}
const AI_SIDE='defender',PLAYER_SIDE='attacker';
const sideName=s=>s==='attacker'?'攻方':'守方';
const unitById=id=>state.units.find(u=>u.id===id);
function msg(s){$('help').textContent=s;}
function eventText(e){const n=id=>names[id]||id;switch(e.type){case'UNIT_ACTIVATED':return `⚑ ${n(e.unitId)} 開始行動`;case'UNIT_STEP':return `${n(e.unitId)} 移動至 (${e.to.q},${e.to.r})`;case'ATTACK_RESOLVED':return `⚔ ${n(e.attackerId)} 攻擊 ${n(e.targetId)}（${matchupLabel(unitById(e.attackerId)?.type,unitById(e.targetId)?.type)}），造成 ${e.loss} 人損失`;case'REACTION_OPENED':return '⚠ 敵方反應窗口開啟';case'REACTION_PASSED':return '反應已放棄';case'REACTION_SELECTED':return `${n(e.unitId)} 發動反應`;case'GUN_RELOADED':return `${n(e.unitId)} 裝填完成`;case'ACTIVATION_ENDED':return `${n(e.unitId)} 結束行動`;case'ROUND_STARTED':return `第 ${e.round} 輪開始`;case'BATTLE_FINISHED':return `戰鬥結束：${e.reason}`;default:return null;}}
function send(type,fields={},side=state.activation?.side??state.nextSide){const cmd={id:`D1-${++commandNumber}`,type,side,expectedRevision:state.revision,...fields};const r=turnDispatch(state,cmd);if(!r.ok){msg(`無法執行：${r.error}`);return false;}state=r.state;for(const e of r.events??[]){const line=eventText(e);if(line)logLines.unshift(line);}if(logLines.length>70)logLines.length=70;if(state.phase==='TACTICAL_FINISHED')msg(`戰鬥結束：${state.result?.winner?sideName(state.result.winner)+'獲勝':'平手'}（${state.result?.reason}）`);render();showDamage(r.events);queueAi();return true;}
const xy=(q,r)=>({x:45+54*q+27*r,y:52+49*r});
const polygon=(x,y,rad=32)=>Array.from({length:6},(_,i)=>{const a=(Math.PI/180)*(60*i-30);return `${(x+rad*Math.cos(a)).toFixed(2)},${(y+rad*Math.sin(a)).toFixed(2)}`;}).join(' ');
function svgEl(tag,attrs={},parent=$('map')){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));parent.append(el);return el;}
function virtualActivation(u){return state.activation?state:{...state,activation:{unitId:u.id,side:u.side,moved:false,mainUsed:false}};}
function canPick(u){return !!u&&canSelectWithoutActivation(state,u.id,PLAYER_SIDE);}
function reachableFor(u){return u&&state.phase==='ACTIVE'&&((state.activation?.unitId===u.id&&!state.activation.moved&&!state.activation.mainUsed)||canPick(u))?reachable(u,state):[];}
function commitSelection(){if(!state.activation&&selected&&canPick(unitById(selected)))return send('ACTIVATE_UNIT',{unitId:selected},PLAYER_SIDE);return state.activation?.unitId===selected;}
function targetsFor(u){if(!u||state.phase!=='ACTIVE'||!(state.activation?.unitId===u.id&&!state.activation.mainUsed||canPick(u)))return [];const probe=preview?{...state,units:state.units.map(v=>v.id===u.id?previewPosition(state,preview,u.id):v)}:state;return probe.units.filter(t=>t.side!==u.side&&validateAttack(probe,u.id,t.id).ok);}
function render(){const svg=$('map');svg.replaceChildren();$('round').textContent=`第 ${state.round} 輪`;const active=state.activation;$('turn').textContent=active?`${sideName(active.side)} · ${names[active.unitId]}`:`${sideName(state.nextSide)}待命`;$('remaining').textContent=`${sideName(active?.side??state.nextSide)}尚可行動 ${remainingUnits(state).length} 隊`; $('phase').textContent=state.phase==='REACTION_PENDING'?'⚠ 反應待決':state.phase==='TACTICAL_FINISHED'?'戰鬥結束':'戰鬥中';
 const u=unitById(selected),reach=mode==='move'?reachableFor(u):[],targets=mode==='attack'?targetsFor(u):[];
 const rkeys=new Set(reach.map(h=>`${h.hex.q},${h.hex.r}`)),tkeys=new Set(targets.map(t=>`${t.q},${t.r}`));
 for(let r=0;r<10;r++)for(let q=0;q<10;q++){const {x,y}=xy(q,r),terrain=state.map.cells[`${q},${r}`].terrain;const color={plain:'#81946c',forest:'#476a50',hill:'#ad9a6b',mountain:'#777a79'}[terrain]||'#81946c';const p=svgEl('polygon',{points:polygon(x,y),fill:color,class:`hex ${selected&&u?.q===q&&u?.r===r?'selected':''} ${rkeys.has(`${q},${r}`)?'reachable':''} ${tkeys.has(`${q},${r}`)?'target':''}`});p.addEventListener('click',()=>clickHex(q,r));}
 for(const o of state.objectives){const {x,y}=xy(o.q,o.r);const t=svgEl('text',{x,y:y+7,class:'obj'});t.textContent='⚑';}
 for(const original of state.units){const v=previewPosition(state,preview,original.id);if(v.withdrawn||v.q==null)continue;const {x,y}=xy(v.q,v.r),g=svgEl('g',{class:'unit','pointer-events':'none'});svgEl('circle',{cx:x,cy:y,r:22,fill:v.side==='attacker'?'#315d9c':'#a14440',opacity:v.soldiers>0?1:.45},g);const t=svgEl('text',{x,y:y-1},g);t.textContent={spear:'槍',cavalry:'騎',bow:'弓',gun:'鐵'}[v.type];const n=svgEl('text',{x,y:y+12,'font-size':'9'},g);n.textContent=String(v.soldiers);if(v.id===selected)svgEl('circle',{cx:x,cy:y,r:25,fill:'none',stroke:'#ffe6a4','stroke-width':3},g);else if(v.side===(active?.side??state.nextSide)&&!v.activatedThisRound&&!v.routed&&v.soldiers>0)svgEl('circle',{cx:x,cy:y,r:26,fill:'none',stroke:'#83d8a0','stroke-width':3,'stroke-dasharray':'5 3'},g);else if(v.activatedThisRound)svgEl('text',{x:x+19,y:y-18,'font-size':'17',fill:'#f5f5f5','stroke':'#202020','stroke-width':'0.5'},g).textContent='✓';}
 $('unitInfo').innerHTML=u?`<div class="unit-title">${names[u.id]} · ${labels[u.type]}</div><div>${sideName(u.side)}｜兵力 ${u.soldiers}/500｜士氣 ${u.morale}</div><div class="muted">座標 ${u.q},${u.r}｜${preview?.unitId===u.id?'暫定移動，可反悔':u.routed?'潰走':u.activatedThisRound?'本輪已啟動':'待命'}${u.type==='gun'?`｜鐵砲 ${u.gunState==='UNLOADED'?'未裝填':'已裝填'}`:''}</div>`:'點選任一部隊查看資訊';
 $('log').replaceChildren(...logLines.slice(0,24).map(t=>{const e=document.createElement('div');e.textContent=t;return e;}));
 const own=u?.side===(active?.side??state.nextSide),valid=state.phase==='ACTIVE';
 $('undo').disabled=!preview; $('attack').disabled=!valid||!(active?.unitId===selected||canPick(u))||!targetsFor(u).length;
 $('reload').disabled=!valid||!active||active.unitId!==selected||active.mainUsed||active.moved||!!preview||u?.type!=='gun'||u.gunState!=='UNLOADED';
 $('end').disabled=!valid||!(active?.side===PLAYER_SIDE||canPick(u));
 $('pass').disabled=state.phase!=='REACTION_PENDING'||state.pending?.window?.candidates?.[0]&&unitById(state.pending.window.candidates[0].unitId)?.side!==PLAYER_SIDE;
 $('attack').classList.toggle('active',mode==='attack');
}
function chooseUnit(unit){
 if(unit.side!==PLAYER_SIDE){selected=unit.id;mode=null;msg('敵方由 AI 操作。');render();return;}
 if(state.phase!=='ACTIVE'||state.nextSide!==PLAYER_SIDE&& !state.activation){msg('目前是 AI 回合。');return;}
 if(state.activation&&state.activation.unitId!==unit.id){msg('此部隊已正式開始行動，請先結束行動。');return;}
 // Merely selecting does NOT activate or consume an action.
 if(!state.activation&&selected!==unit.id)preview=null;
 selected=unit.id;mode=canPick(unit)||state.activation?.unitId===unit.id&&!state.activation.moved?'move':null;
 msg(mode==='move'?'可自由切換我方部隊；點黃色格子暫定移動，確認攻擊或結束行動才鎖定。':'此部隊本輪已行動，可查看資訊。');render();
}
function openAttack(target){pendingTarget=target.id;const u=unitById(selected);const probe=preview?{...state,units:state.units.map(v=>v.id===u.id?previewPosition(state,preview,u.id):v)}:state;const e=estimateAttack(probe,selected,target.id);$('attackPreview').textContent=e.ok?`${names[selected]} → ${names[target.id]}\n預估損失 ${e.min}～${e.max} 人\n敵軍預估剩餘 ${e.remainingMin}～${e.remainingMax} 人\n${e.matchup}（非保證傷害）`:`無法攻擊：${e.error}`;$('confirmAttack').disabled=!e.ok;$('attackConfirm').hidden=false;}
function clickHex(q,r){
 if(state.phase==='TACTICAL_FINISHED'||state.phase==='REACTION_PENDING'||aiBusy||state.nextSide===AI_SIDE&&!state.activation)return;
 const unit=state.units.find(u=>u.q===q&&u.r===r&&!u.withdrawn&&u.soldiers>0),u=unitById(selected);
 if(mode==='move'&&u){const entry=reachableFor(u).find(v=>v.hex.q===q&&v.hex.r===r);if(entry){preview=stageMove(virtualActivation(u),selected,entry);msg('暫定移動：可再點其他格子，或按「取消移動」。攻擊或結束行動時才提交。');render();return;}}
 if(unit&&u&&unit.side!==u.side&&(state.activation?.unitId===u.id||canPick(u))&&targetsFor(u).some(t=>t.id===unit.id)){openAttack(unit);return;}
 if(unit){if(state.activation&&unit.side===state.activation.side&&unit.id!==state.activation.unitId){msg('已提交行動，請先結束目前部隊的行動。');return;}chooseUnit(unit);return;}
 mode=(state.activation?.unitId===selected&&!state.activation.moved||canPick(unitById(selected)))?'move':null;render();
}
$('attack').onclick=()=>{mode='attack';msg('點選可攻擊的敵軍，確認後才會造成傷害。');render();};
$('confirmCancel').onclick=()=>{$('attackConfirm').hidden=true;pendingTarget=null;};
$('confirmAttack').onclick=()=>{const targetId=pendingTarget;$('attackConfirm').hidden=true;pendingTarget=null;if(!commitSelection())return;if(preview){const p=preview;preview=null;if(!send('MOVE_UNIT',{unitId:selected,path:p.path}))return;if(state.phase==='REACTION_PENDING'){msg('移動觸發敵軍反應，請先處理反應，再重新選擇攻擊。');return;}}if(targetId){mode=null;if(send('ATTACK_UNIT',{unitId:selected,targetId})){msg('攻擊已結算，位置已鎖定。');/* send() 已重新繪製並加上傷害飄字；不可再 render() 清除特效 */}}};
$('reload').onclick=()=>{if(commitSelection()&&send('RELOAD_GUN',{unitId:selected}))msg('鐵砲已裝填，請結束部隊行動。');};
$('undo').onclick=()=>{if(preview){preview=null;mode='move';msg('已取消暫定移動，返回原位置。');render();}};
$('end').onclick=()=>{if(!commitSelection())return;if(preview){const p=preview;preview=null;if(!send('MOVE_UNIT',{unitId:selected,path:p.path}))return;if(state.phase==='REACTION_PENDING'){msg('移動觸發敵方反應，請先處理。');return;}}if(send('END_ACTIVATION')){mode=null;selected=null;preview=null;msg('等待 AI 行動，或點選尚可行動的我方部隊。');render();}};
$('pass').onclick=()=>{if(state.pending?.window){const reactUnit=state.units.find(u=>u.id===state.pending.window.candidates[0]?.unitId);if(send('PASS_REACTION',{windowId:state.pending.window.id},reactUnit?.side)){mode=null;msg('已放棄反應。');}}};
$('reset').onclick=()=>{if(!confirm('確定重新開始示範戰役？'))return;reset();};
function reset(){aiBusy=false;aiScheduled=false;state=createTurnBattle(initial);selected=null;mode=null;pendingTarget=null;preview=null;$('attackConfirm').hidden=true;commandNumber=0;logLines=['試玩場景已載入。請選擇藍色攻方部隊。'];msg('點選藍色部隊自由切換，黃色格子可暫定移動；紅色由普通 AI 操作。');render();}
// AI plays only the red defender; one command per timer tick keeps Safari responsive.
function queueAi(){if(aiScheduled||aiBusy||state.phase==='TACTICAL_FINISHED')return;
 const reaction=state.phase==='REACTION_PENDING';
 const reactSide=reaction?unitById(state.pending?.window?.candidates?.[0]?.unitId)?.side:null;
 if(!(reaction&&reactSide===AI_SIDE||!reaction&&(state.activation?.side??state.nextSide)===AI_SIDE))return;
 aiScheduled=true;setTimeout(aiStep,220);
}
function aiStep(){aiScheduled=false;if(state.phase==='TACTICAL_FINISHED')return;aiBusy=true;
 try{
  if(state.phase==='REACTION_PENDING'){
   const candidates=state.pending.window.candidates;const c=candidates.find(c=>unitById(c.unitId)?.side===AI_SIDE);
   if(c){const target=unitById(state.pending.window.moverId??state.activation?.unitId);
    const choice=candidates.find(x=>unitById(x.unitId)?.side===AI_SIDE&&target&&validateAttack(state,x.unitId,target.id).ok);
    if(choice)send('CHOOSE_REACTION',{windowId:state.pending.window.id,unitId:choice.unitId},AI_SIDE);
    else send('PASS_REACTION',{windowId:state.pending.window.id},AI_SIDE);
   }
  }else if((state.activation?.side??state.nextSide)===AI_SIDE){
   const a=state.activation;
   if(!a){const plan=planAiActivation(state,AI_SIDE,visibleKnowledge(state,AI_SIDE),{difficulty:'normal'});if(plan)send('ACTIVATE_UNIT',{unitId:plan.unitId},AI_SIDE);}
   else{
    const u=unitById(a.unitId),enemies=visibleKnowledge(state,AI_SIDE).visibleEnemies;
    const targetId=!a.mainUsed?chooseAiTarget(state,u.id,enemies.map(e=>e.id)):null;const target=targetId?unitById(targetId):null;
    if(target)send('ATTACK_UNIT',{unitId:u.id,targetId:target.id},AI_SIDE);
    else if(u.type==='gun'&&u.gunState==='UNLOADED'&&!a.mainUsed&&!a.moved)send('RELOAD_GUN',{unitId:u.id},AI_SIDE);
    else if(!a.moved&&enemies.length){const old=Math.min(...enemies.map(e=>hexDistance(u,e)));const moves=reachable(u,state).filter(m=>m.path?.length).map(m=>({...m,d:Math.min(...enemies.map(e=>hexDistance(m.hex,e)))})).filter(m=>m.d<old).sort((x,y)=>x.d-y.d||x.cost-y.cost);
      if(moves.length)send('MOVE_UNIT',{unitId:u.id,path:moves[0].path},AI_SIDE);else send('END_ACTIVATION',{},AI_SIDE);
    }else send('END_ACTIVATION',{},AI_SIDE);
   }
  }
 }catch(e){msg('AI 發生錯誤：'+e.message);console.error(e);}finally{aiBusy=false;queueAi();}
}
reset();
