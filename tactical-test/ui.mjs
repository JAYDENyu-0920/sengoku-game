import {makeMap,reachable,hexDistance} from './battle-core.mjs';
import {createTurnBattle,turnDispatch} from './battle-turns.mjs';
import {validateAttack} from './battle-combat.mjs';
import {stageMove,previewPosition,canUndoPreview,remainingUnits} from './battle-preview.mjs';
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
let state,selected=null,mode=null,commandNumber=0,logLines=[],pendingTarget=null,preview=null;
const sideName=s=>s==='attacker'?'攻方':'守方';
const unitById=id=>state.units.find(u=>u.id===id);
function msg(s){$('help').textContent=s;}
function eventText(e){const n=id=>names[id]||id;switch(e.type){case'UNIT_ACTIVATED':return `⚑ ${n(e.unitId)} 開始行動`;case'UNIT_STEP':return `${n(e.unitId)} 移動至 (${e.to.q},${e.to.r})`;case'ATTACK_RESOLVED':return `⚔ ${n(e.attackerId)} 攻擊 ${n(e.targetId)}，造成 ${e.loss} 人損失`;case'REACTION_OPENED':return '⚠ 敵方反應窗口開啟';case'REACTION_PASSED':return '反應已放棄';case'REACTION_SELECTED':return `${n(e.unitId)} 發動反應`;case'GUN_RELOADED':return `${n(e.unitId)} 裝填完成`;case'ACTIVATION_ENDED':return `${n(e.unitId)} 結束行動`;case'ROUND_STARTED':return `第 ${e.round} 輪開始`;case'BATTLE_FINISHED':return `戰鬥結束：${e.reason}`;default:return null;}}
function send(type,fields={},side=state.activation?.side??state.nextSide){const cmd={id:`D1-${++commandNumber}`,type,side,expectedRevision:state.revision,...fields};const r=turnDispatch(state,cmd);if(!r.ok){msg(`無法執行：${r.error}`);return false;}state=r.state;for(const e of r.events??[]){const line=eventText(e);if(line)logLines.unshift(line);}if(logLines.length>70)logLines.length=70;if(state.phase==='TACTICAL_FINISHED')msg(`戰鬥結束：${state.result?.winner?sideName(state.result.winner)+'獲勝':'平手'}（${state.result?.reason}）`);render();return true;}
const xy=(q,r)=>({x:45+54*q+27*r,y:52+49*r});
const polygon=(x,y,rad=32)=>Array.from({length:6},(_,i)=>{const a=(Math.PI/180)*(60*i-30);return `${(x+rad*Math.cos(a)).toFixed(2)},${(y+rad*Math.sin(a)).toFixed(2)}`;}).join(' ');
function svgEl(tag,attrs={},parent=$('map')){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));parent.append(el);return el;}
function reachableFor(u){return u&&state.activation?.unitId===u.id&&!state.activation.moved&&!state.activation.mainUsed&&state.phase==='ACTIVE'?reachable(u,state):[];}
function targetsFor(u){if(!u||state.activation?.unitId!==u.id||state.activation.mainUsed||state.phase!=='ACTIVE')return [];const probe=preview?{...state,units:state.units.map(v=>v.id===u.id?previewPosition(state,preview,u.id):v)}:state;return probe.units.filter(t=>t.side!==u.side&&validateAttack(probe,u.id,t.id).ok);}
function render(){const svg=$('map');svg.replaceChildren();$('round').textContent=`第 ${state.round} 輪`;const active=state.activation;$('turn').textContent=active?`${sideName(active.side)} · ${names[active.unitId]}`:`${sideName(state.nextSide)}待命`;$('remaining').textContent=`${sideName(active?.side??state.nextSide)}尚可行動 ${remainingUnits(state).length} 隊`; $('phase').textContent=state.phase==='REACTION_PENDING'?'⚠ 反應待決':state.phase==='TACTICAL_FINISHED'?'戰鬥結束':'戰鬥中';
 const u=unitById(selected),reach=mode==='move'?reachableFor(u):[],targets=mode==='attack'?targetsFor(u):[];
 const rkeys=new Set(reach.map(h=>`${h.hex.q},${h.hex.r}`)),tkeys=new Set(targets.map(t=>`${t.q},${t.r}`));
 for(let r=0;r<10;r++)for(let q=0;q<10;q++){const {x,y}=xy(q,r),terrain=state.map.cells[`${q},${r}`].terrain;const color={plain:'#81946c',forest:'#476a50',hill:'#ad9a6b',mountain:'#777a79'}[terrain]||'#81946c';const p=svgEl('polygon',{points:polygon(x,y),fill:color,class:`hex ${selected&&u?.q===q&&u?.r===r?'selected':''} ${rkeys.has(`${q},${r}`)?'reachable':''} ${tkeys.has(`${q},${r}`)?'target':''}`});p.addEventListener('click',()=>clickHex(q,r));}
 for(const o of state.objectives){const {x,y}=xy(o.q,o.r);const t=svgEl('text',{x,y:y+7,class:'obj'});t.textContent='⚑';}
 for(const original of state.units){const v=previewPosition(state,preview,original.id);if(v.withdrawn||v.q==null)continue;const {x,y}=xy(v.q,v.r),g=svgEl('g',{class:'unit','pointer-events':'none'});svgEl('circle',{cx:x,cy:y,r:22,fill:v.side==='attacker'?'#315d9c':'#a14440',opacity:v.soldiers>0?1:.45},g);const t=svgEl('text',{x,y:y-1},g);t.textContent={spear:'槍',cavalry:'騎',bow:'弓',gun:'鐵'}[v.type];const n=svgEl('text',{x,y:y+12,'font-size':'9'},g);n.textContent=String(v.soldiers);if(v.id===selected)svgEl('circle',{cx:x,cy:y,r:25,fill:'none',stroke:'#ffe6a4','stroke-width':3},g);else if(v.side===(active?.side??state.nextSide)&&!v.activatedThisRound&&!v.routed&&v.soldiers>0)svgEl('circle',{cx:x,cy:y,r:26,fill:'none',stroke:'#83d8a0','stroke-width':3,'stroke-dasharray':'5 3'},g);else if(v.activatedThisRound)svgEl('text',{x:x+19,y:y-18,'font-size':'17',fill:'#f5f5f5','stroke':'#202020','stroke-width':'0.5'},g).textContent='✓';}
 $('unitInfo').innerHTML=u?`<div class="unit-title">${names[u.id]} · ${labels[u.type]}</div><div>${sideName(u.side)}｜兵力 ${u.soldiers}/500｜士氣 ${u.morale}</div><div class="muted">座標 ${u.q},${u.r}｜${preview?.unitId===u.id?'暫定移動，可反悔':u.routed?'潰走':u.activatedThisRound?'本輪已啟動':'待命'}${u.type==='gun'?`｜鐵砲 ${u.gunState==='UNLOADED'?'未裝填':'已裝填'}`:''}</div>`:'點選任一部隊查看資訊';
 $('log').replaceChildren(...logLines.slice(0,24).map(t=>{const e=document.createElement('div');e.textContent=t;return e;}));
 const own=u?.side===(active?.side??state.nextSide),valid=state.phase==='ACTIVE';
 $('undo').disabled=!canUndoPreview(state,preview); $('attack').disabled=!valid||!active||active.unitId!==selected||active.mainUsed||!targetsFor(u).length;
 $('reload').disabled=!valid||!active||active.unitId!==selected||active.mainUsed||active.moved||!!preview||u?.type!=='gun'||u.gunState!=='UNLOADED';
 $('end').disabled=!valid||!active;
 $('pass').disabled=state.phase!=='REACTION_PENDING';
 $('attack').classList.toggle('active',mode==='attack');
}
function chooseUnit(unit){
  selected=unit.id;mode=null;
  if(state.phase==='ACTIVE'&&!state.activation&&unit.side===state.nextSide&&!unit.activatedThisRound&&!unit.routed&&unit.soldiers>0){
    if(send('ACTIVATE_UNIT',{unitId:unit.id})){mode='move';msg('已自動啟動部隊。點選黃色格子移動，或選擇攻擊。');}
  }else if(state.activation?.unitId===unit.id&&!state.activation.moved){mode='move';msg('點選黃色格子即可移動。');}
  else msg(unit.side===state.nextSide?'此部隊已行動或無法啟動。':'已選取部隊，請操作輪到的一方。');
  render();
}
function openAttack(target){pendingTarget=target.id;$('attackPreview').textContent=`${names[selected]} 攻擊 ${names[target.id]}？（傷害依兵種、武將及士氣計算）`;$('attackConfirm').hidden=false;}
function clickHex(q,r){
 if(state.phase==='TACTICAL_FINISHED'||state.phase==='REACTION_PENDING')return;
 const unit=state.units.find(u=>u.q===q&&u.r===r&&!u.withdrawn&&u.soldiers>0),u=unitById(selected);
 if(mode==='move'&&u){const entry=reachableFor(u).find(v=>v.hex.q===q&&v.hex.r===r);if(entry){preview=stageMove(state,selected,entry);msg('暫定移動：可再點其他格子，或按「取消移動」。攻擊或結束行動時才提交。');render();return;}}
 if(unit&&u&&unit.side!==u.side&&state.activation?.unitId===u.id&&targetsFor(u).some(t=>t.id===unit.id)){openAttack(unit);return;}
 if(unit){if(state.activation&&unit.side===state.activation.side&&unit.id!==state.activation.unitId){msg('請先結束目前部隊的行動。');return;}chooseUnit(unit);return;}
 mode=state.activation?.unitId===selected&&!state.activation.moved?'move':null;render();
}
$('attack').onclick=()=>{mode='attack';msg('點選可攻擊的敵軍，確認後才會造成傷害。');render();};
$('confirmCancel').onclick=()=>{$('attackConfirm').hidden=true;pendingTarget=null;};
$('confirmAttack').onclick=()=>{const targetId=pendingTarget;$('attackConfirm').hidden=true;pendingTarget=null;if(preview){const p=preview;preview=null;if(!send('MOVE_UNIT',{unitId:selected,path:p.path}))return;if(state.phase==='REACTION_PENDING'){msg('移動觸發敵軍反應，請先處理反應，再重新選擇攻擊。');return;}}if(targetId&&send('ATTACK_UNIT',{unitId:selected,targetId})){mode=null;msg('攻擊已結算，位置已鎖定。');render();}};
$('reload').onclick=()=>{if(send('RELOAD_GUN',{unitId:selected}))msg('鐵砲已裝填，請結束部隊行動。');};
$('undo').onclick=()=>{if(canUndoPreview(state,preview)){preview=null;mode='move';msg('已取消暫定移動，返回原位置。');render();}};
$('end').onclick=()=>{if(preview){const p=preview;preview=null;if(!send('MOVE_UNIT',{unitId:selected,path:p.path}))return;if(state.phase==='REACTION_PENDING'){msg('移動觸發敵方反應，請先處理。');return;}}if(send('END_ACTIVATION')){mode=null;selected=null;preview=null;msg('輪到下一方。點選部隊即可直接行動。');render();}};
$('pass').onclick=()=>{if(state.pending?.window){const reactUnit=state.units.find(u=>u.id===state.pending.window.candidates[0]?.unitId);if(send('PASS_REACTION',{windowId:state.pending.window.id},reactUnit?.side)){mode=null;msg('已放棄反應。');}}};
$('reset').onclick=()=>{if(!confirm('確定重新開始示範戰役？'))return;reset();};
function reset(){state=createTurnBattle(initial);selected=null;mode=null;pendingTarget=null;preview=null;$('attackConfirm').hidden=true;commandNumber=0;logLines=['試玩場景已載入。請選擇藍色攻方部隊。'];msg('點選藍色部隊即可啟動，黃色格子可直接移動。');render();}
reset();
