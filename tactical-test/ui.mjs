import {CARD_POOL} from './battle-tactics.mjs';
import {cardStatus} from './battle-d8-cards.mjs';
import {WEATHER,weatherRule} from './battle-weather.mjs';
import {availableSkills,SKILLS} from './battle-skills.mjs';
import {SIZES,ROSTER,DEFENDERS,validateFormation,buildFormationSnapshot} from './battle-formation.mjs';
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
const names=Object.fromEntries([...ROSTER,...DEFENDERS].map(o=>[o.id,o.name]));
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
let chosenWeather='sun';
let formation={size:'skirmish',officers:['a1','a2','a3'],commander:'a1'};
let effects=[];let selectedSkill=null;let queuedAttack=null;let plannedSkill=null,plannedCard=null,plannedTarget=null,queuedPlan=null;let rangeMode='move';
function showDamage(events){for(const e of events??[]){if(e.type!=='ATTACK_RESOLVED')continue;const target=unitById(e.targetId);if(!target)continue;const {x,y}=xy(target.q,target.r);const svg=$('map');const t=svgEl('text',{x,y:y-27,class:'damage-float'},svg);t.textContent=`-${e.loss}`;setTimeout(()=>t.remove(),850);}}
const AI_SIDE='defender',PLAYER_SIDE='attacker';
const sideName=s=>s==='attacker'?'攻方':'守方';
const unitById=id=>state.units.find(u=>u.id===id);
function msg(s){$('help').textContent=s;}
function eventText(e){const n=id=>names[id]||id;switch(e.type){case'UNIT_ACTIVATED':return `⚑ ${n(e.unitId)} 開始行動`;case'UNIT_STEP':return `${n(e.unitId)} 移動至 (${e.to.q},${e.to.r})`;case'ATTACK_RESOLVED':return `⚔ ${n(e.attackerId)} 攻擊 ${n(e.targetId)}（${matchupLabel(unitById(e.attackerId)?.type,unitById(e.targetId)?.type)}），造成 ${e.loss} 人損失`;case'DEFENSE_OPENED':return `⚠ ${n(e.unitId)} 面臨騎兵攻擊，等待槍衾決定`;case'DEFENSE_SELECTED':return `🛡 ${n(e.unitId)} 槍衾防禦成功，傷害減少 30%`;case'DEFENSE_PASSED':return `${n(e.unitId)} 未使用槍衾`;case'REACTION_OPENED':return '⚠ 敵方反應窗口開啟';case'REACTION_PASSED':return '反應已放棄';case'REACTION_SELECTED':return `${n(e.unitId)} 發動反應`;case'GUN_AUTO_RELOADED':return `${n(e.unitId)} 自動裝填完成`;case'GUN_RELOADED':return `${n(e.unitId)} 裝填完成`;case'ACTIVATION_ENDED':return `${n(e.unitId)} 結束行動`;case'SKILL_USED':return `✦ ${n(e.unitId)} 發動 ${SKILLS[e.skillId]?.name??e.skillId}（軍令 -${e.cost}）`;case'CARD_PLAYED':return `🃏 ${n(e.unitId)} 使用戰術卡「${e.name}」（軍令 -1）`;case'ROUND_STARTED':return `第 ${e.round} 輪開始`;case'BATTLE_FINISHED':return `戰鬥結束：${e.reason}`;default:return null;}}
function send(type,fields={},side=state.activation?.side??state.nextSide){const cmd={id:`D1-${++commandNumber}`,type,side,expectedRevision:state.revision,...fields};const r=turnDispatch(state,cmd);if(!r.ok){msg(`無法執行：${r.error}`);return false;}state=r.state;for(const e of r.events??[]){const line=eventText(e);if(line)logLines.unshift(line);}if(logLines.length>70)logLines.length=70;if(state.phase==='TACTICAL_FINISHED')msg(`戰鬥結束：${state.result?.winner?sideName(state.result.winner)+'獲勝':'平手'}（${state.result?.reason}）`);render();showDamage(r.events);queueAi();resumeQueuedAttack();resumeQueuedPlan();return true;}
const xy=(q,r)=>({x:45+54*q+27*r,y:52+49*r});
const polygon=(x,y,rad=32)=>Array.from({length:6},(_,i)=>{const a=(Math.PI/180)*(60*i-30);return `${(x+rad*Math.cos(a)).toFixed(2)},${(y+rad*Math.sin(a)).toFixed(2)}`;}).join(' ');
function svgEl(tag,attrs={},parent=$('map')){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));parent.append(el);return el;}
function virtualActivation(u){return state.activation?state:{...state,activation:{unitId:u.id,side:u.side,moved:false,mainUsed:false}};}
function canPick(u){return !!u&&canSelectWithoutActivation(state,u.id,PLAYER_SIDE);}
function reachableFor(u){return u&&state.phase==='ACTIVE'&&((state.activation?.unitId===u.id&&!state.activation.moved&&!state.activation.mainUsed)||canPick(u))?reachable(u,state):[];}
function commitSelection(){if(!state.activation&&selected&&canPick(unitById(selected)))return send('ACTIVATE_UNIT',{unitId:selected},PLAYER_SIDE);return state.activation?.unitId===selected;}
function targetsFor(u){if(!u||state.phase!=='ACTIVE'||!(state.activation?.unitId===u.id&&!state.activation.mainUsed||canPick(u)))return [];const probe=preview?{...state,units:state.units.map(v=>v.id===u.id?{...previewPosition(state,preview,u.id),movedThisActivation:true}:v)}:state;return probe.units.filter(t=>t.side!==u.side&&validateAttack(probe,u.id,t.id).ok);}
function resumeQueuedAttack(){
 if(!queuedAttack||state.phase!=='ACTIVE')return;
 const job=queuedAttack;
 if(!state.activation||state.activation.unitId!==job.unitId||state.activation.side!==PLAYER_SIDE||state.activation.mainUsed){queuedAttack=null;return;}
 // Wait for any subsequent reaction windows to resolve; never repeat the confirmation dialog.
 queuedAttack=null;
 const action=job.skillId?'USE_SKILL':'ATTACK_UNIT';
 if(send(action,{unitId:job.unitId,targetId:job.targetId,...(job.skillId?{skillId:job.skillId}:{})},PLAYER_SIDE)){
  selectedSkill=null;mode=null;msg('移動反應處理完畢，已自動完成原本確認的攻擊。');
 }else msg('移動後無法完成預定攻擊（可能已被反擊擊退、射線受阻或目標失效），請重新選擇。');
}
function plannedCost(){return (plannedSkill?SKILLS[plannedSkill]?.cost??0:0)+(plannedCard?1:0);}
function clearPlan(){plannedSkill=null;plannedCard=null;plannedTarget=null;selectedSkill=null;queuedPlan=null;}
function resumeQueuedPlan(){
 if(!queuedPlan||state.phase!=='ACTIVE')return;
 const job=queuedPlan;queuedPlan=null;
 if(state.activation?.unitId!==job.unitId||state.activation.side!==PLAYER_SIDE){msg('部隊已無法繼續執行規劃，後續指令已取消。');return;}
 finishPlan(job);
}
function finishPlan(job){
 if(job.skillId){if(!send('USE_SKILL',{unitId:job.unitId,skillId:job.skillId,...(job.targetId?{targetId:job.targetId}:{})},PLAYER_SIDE))return;}
 else if(job.targetId){if(!send('ATTACK_UNIT',{unitId:job.unitId,targetId:job.targetId},PLAYER_SIDE))return;}
 if(job.end){if(send('END_ACTIVATION',{},PLAYER_SIDE)){selected=null;mode=null;render();}}
}
function finalizePlan(end=false){
 const id=selected,u=unitById(id);if(!u||!canPick(u)&&state.activation?.unitId!==id)return;
 if(plannedCost()>(state.orders?.attacker??0)){msg('軍令不足，請先調整規劃。');return;}
 if(plannedSkill&&SKILLS[plannedSkill].kind==='attack'&&!plannedTarget){msg('攻擊型戰法需要先選擇攻擊目標。');return;}
 const job={unitId:id,skillId:plannedSkill,targetId:plannedTarget,end};const card=plannedCard,path=preview?.path;
 if(!commitSelection())return;
 preview=null;clearPlan();
 if(card&&!send('PLAY_CARD',{cardId:card,unitId:id},PLAYER_SIDE))return;
 if(path){if(!send('MOVE_UNIT',{unitId:id,path},PLAYER_SIDE))return;
  if(state.phase==='REACTION_PENDING'){queuedPlan=job;msg('已確認行動，敵方反應結束後會繼續執行。');return;}}
 finishPlan(job);
}
function planningInfo(){const orders=state.orders?.attacker??0,cost=plannedCost();return `目前軍令 ${orders}/5｜待消耗 ${cost}｜確認後 ${orders-cost}\n${preview?'暫定移動 '+preview.q+','+preview.r:'原地'}${plannedSkill?'｜戰法 '+SKILLS[plannedSkill]?.name:''}${plannedCard?'｜卡牌 '+CARD_POOL.find(c=>c.id===plannedCard)?.name:''}${plannedTarget?'｜攻擊 '+(names[plannedTarget]??plannedTarget):''}`;}
function virtualProbe(u,position){return {...state,units:state.units.map(v=>v.id===u.id?{...v,q:position.q,r:position.r,movedThisActivation:position.q!==u.q||position.r!==u.r}:v)};}
function attackTargetsAt(u,position){const probe=virtualProbe(u,position);return probe.units.filter(t=>t.side!==u.side&&!t.withdrawn&&!t.routed&&t.soldiers>0&&validateAttack(probe,u.id,t.id).ok);}
function possibleAttackHexes(u){
 if(!u)return new Set();const origins=rangeMode==='attack'? [preview?{q:preview.q,r:preview.r}:u]:[u,...reachableFor(u).map(e=>e.hex)];
 const result=new Set();for(const pos of origins){if(u.type==='gun'&&(pos.q!==u.q||pos.r!==u.r))continue;
 for(const t of attackTargetsAt(u,pos))result.add(`${t.q},${t.r}`);}
 return result;
}
function playerDefense(){return state.phase==='DEFENSE_PENDING'&&state.defensePending?.defenderSide===PLAYER_SIDE;}
function playerReaction(){return state.phase==='REACTION_PENDING'&&state.pending?.window?.candidates?.some(c=>unitById(c.unitId)?.side===PLAYER_SIDE);}
function renderDefense(){
 const dialog=$('defenseDialog');if(!dialog)return;
 if(!playerDefense()){dialog.hidden=true;return;}
 const p=state.defensePending;dialog.hidden=false;
 $('defenseInfo').textContent=`${names[p.targetId]||p.targetId} 遭騎兵攻擊！可花費 1 軍令發動槍衾，本次減傷 30%；或不使用。`;
 $('defenseChoose').disabled=(state.orders?.attacker??0)<1;
}
$('defenseChoose').onclick=()=>{if(playerDefense())send('CHOOSE_DEFENSE',{windowId:state.defensePending.id,skillId:'phalanx'},PLAYER_SIDE);};
$('defensePass').onclick=()=>{if(playerDefense())send('PASS_DEFENSE',{windowId:state.defensePending.id},PLAYER_SIDE);};
function renderReaction(){
 const dialog=$('reactionDialog');if(!playerReaction()){dialog.hidden=true;return;}
 const win=state.pending.window,mover=unitById(state.pending.unitId);dialog.hidden=false;
 $('reactionInfo').textContent=`${names[mover?.id]||'敵軍'} 正在移動，請選擇一支我方部隊攔截，或放棄此次反應。每支部隊每輪最多反應一次。`;
 const list=$('reactionCandidates');list.replaceChildren();
 for(const c of win.candidates){const actor=unitById(c.unitId);if(actor?.side!==PLAYER_SIDE)continue;
  const button=document.createElement('button');button.type='button';button.textContent=`⚔ ${names[actor.id]||actor.id}（${labels[actor.type]||actor.type}）發動反應攻擊`;
  button.onclick=()=>{if(!playerReaction())return;const windowId=state.pending.window.id;if(send('CHOOSE_REACTION',{windowId,unitId:actor.id},PLAYER_SIDE)){preview=null;mode=null;msg('反應攻擊已結算，敵軍將繼續行動。');}};
  list.append(button);
 }
}
$('reactionPass').onclick=()=>{if(!playerReaction())return;const windowId=state.pending.window.id;if(send('PASS_REACTION',{windowId},PLAYER_SIDE)){preview=null;mode=null;msg('已放棄本次反應，保留未使用部隊的反應機會。');}};
function render(){const svg=$('map');svg.replaceChildren();$('round').textContent=`第 ${state.round} 輪`; $('weather').textContent=`天候：${weatherRule(state).name}｜鐵砲射程 2～${weatherRule(state).gunMax}`; $('orders').textContent=`我方軍令 ${state.orders?.attacker??3}/5（預計消耗 ${plannedCost()}）`; $('planInfo').textContent=planningInfo();const active=state.activation;$('turn').textContent=active?`${sideName(active.side)} · ${names[active.unitId]}`:`${sideName(state.nextSide)}待命`;$('remaining').textContent=`${sideName(active?.side??state.nextSide)}尚可行動 ${remainingUnits(state).length} 隊`; $('phase').textContent=state.phase==='DEFENSE_PENDING'?'⚠ 槍衾防禦待決':state.phase==='REACTION_PENDING'?'⚠ 反應待決':state.phase==='TACTICAL_FINISHED'?'戰鬥結束':'戰鬥中';
 if(selected){const chosen=unitById(selected);if(!chosen||chosen.withdrawn||chosen.routed||chosen.soldiers<=0){selected=null;clearPlan();preview=null;mode=null;}}
 const u=unitById(selected),reach=rangeMode==='move'&&mode==='move'?reachableFor(u):[],targets=mode==='attack'?targetsFor(u):[];
 const rkeys=new Set(reach.map(h=>`${h.hex.q},${h.hex.r}`)),tkeys=rangeMode==='move'?new Set(targets.map(t=>`${t.q},${t.r}`)):possibleAttackHexes(u); $('rangeMode').value=rangeMode;
 for(let r=0;r<10;r++)for(let q=0;q<10;q++){const {x,y}=xy(q,r),terrain=state.map.cells[`${q},${r}`].terrain;const color={plain:'#81946c',forest:'#476a50',hill:'#ad9a6b',mountain:'#777a79'}[terrain]||'#81946c';const p=svgEl('polygon',{points:polygon(x,y),fill:color,class:`hex ${selected&&u?.q===q&&u?.r===r?'selected':''} ${rkeys.has(`${q},${r}`)?'reachable':''} ${tkeys.has(`${q},${r}`)?'target':''}`});p.addEventListener('click',()=>clickHex(q,r));}
 for(const o of state.objectives){const {x,y}=xy(o.q,o.r);const t=svgEl('text',{x,y:y+7,class:'obj'});t.textContent='⚑';}
 for(const original of state.units){const v=previewPosition(state,preview,original.id);if(v.withdrawn||v.routed||v.soldiers<=0||v.q==null||v.r==null)continue;const {x,y}=xy(v.q,v.r),g=svgEl('g',{class:'unit','pointer-events':'none'});svgEl('circle',{cx:x,cy:y,r:22,fill:v.side==='attacker'?'#315d9c':'#a14440',opacity:v.soldiers>0?1:.45},g);const t=svgEl('text',{x,y:y-1},g);t.textContent={spear:'槍',cavalry:'騎',bow:'弓',gun:'鐵'}[v.type];const n=svgEl('text',{x,y:y+12,'font-size':'9'},g);n.textContent=String(v.soldiers);if(v.id===selected)svgEl('circle',{cx:x,cy:y,r:25,fill:'none',stroke:'#ffe6a4','stroke-width':3},g);else if(v.side===(active?.side??state.nextSide)&&!v.activatedThisRound&&!v.routed&&v.soldiers>0)svgEl('circle',{cx:x,cy:y,r:26,fill:'none',stroke:'#83d8a0','stroke-width':3,'stroke-dasharray':'5 3'},g);else if(v.activatedThisRound)svgEl('text',{x:x+19,y:y-18,'font-size':'17',fill:'#f5f5f5','stroke':'#202020','stroke-width':'0.5'},g).textContent='✓';}
 $('unitInfo').innerHTML=u?`<div class="unit-title">${names[u.id]} · ${labels[u.type]}</div><div>${sideName(u.side)}｜兵力 ${u.soldiers}/500｜士氣 ${u.morale}</div><div class="muted">座標 ${u.q},${u.r}｜${preview?.unitId===u.id?'暫定移動，可反悔':u.routed?'潰走':u.activatedThisRound?'本輪已啟動':'待命'}${u.type==='gun'?`｜鐵砲 ${u.gunReloadUntilRound>0?`自動裝填中（第 ${u.gunReloadUntilRound} 輪可射擊）`:'已裝填'}`:''}</div>`:'點選任一部隊查看資訊';
 $('log').replaceChildren(...logLines.slice(0,24).map(t=>{const e=document.createElement('div');e.textContent=t;return e;}));
 const own=u?.side===(active?.side??state.nextSide),valid=state.phase==='ACTIVE';
 $('undo').disabled=!preview; $('skill').disabled=false; $('skill').textContent=u?.side===PLAYER_SIDE?'武將戰法 · '+(names[u.id]||'已選部隊'):'武將戰法 · 點此查看'; $('attack').disabled=!valid||!(active?.unitId===selected||canPick(u)); $('attack').title=u?.type==='gun'&&preview?'鐵砲移動後無法射擊；請取消暫定移動':'沒有可攻擊的目標時，請檢查射程、射線及裝填狀態';
 $('reload').hidden=true;
 $('end').disabled=!valid||!(active?.side===PLAYER_SIDE||canPick(u));
 $('pass').hidden=true; // D7: reaction is handled by a dedicated dialog.
 renderReaction();renderDefense();
 $('attack').classList.toggle('active',mode==='attack');
}
function chooseUnit(unit){if(selected!==unit.id)clearPlan();
 if(unit.side!==PLAYER_SIDE){selected=unit.id;mode=null;msg('敵方由 AI 操作。');render();return;}
 if(state.phase!=='ACTIVE'||state.nextSide!==PLAYER_SIDE&& !state.activation){msg('目前是 AI 回合。');return;}
 if(state.activation&&state.activation.unitId!==unit.id){msg('此部隊已正式開始行動，請先結束行動。');return;}
 // Merely selecting does NOT activate or consume an action.
 if(!state.activation&&selected!==unit.id)preview=null;
 selected=unit.id;mode=canPick(unit)||state.activation?.unitId===unit.id&&!state.activation.moved?'move':null;
 msg(mode==='move'?'可自由切換我方部隊；點黃色格子暫定移動，確認攻擊或結束行動才鎖定。':'此部隊本輪已行動，可查看資訊。');render();
}
function openAttack(target){pendingTarget=target.id;const u=unitById(selected);const probe=preview?{...state,units:state.units.map(v=>v.id===u.id?{...previewPosition(state,preview,u.id),movedThisActivation:true}:v)}:state;const e=estimateAttack(probe,selected,target.id);$('attackPreview').textContent=e.ok?`${names[selected]} → ${names[target.id]}\n預估損失 ${Math.floor(e.min*(1+(selectedSkill?SKILLS[selectedSkill].bonus??0:0)))}～${Math.floor(e.max*(1+(selectedSkill?SKILLS[selectedSkill].bonus??0:0)))} 人\n敵軍剩餘兵力依戰法加成重新結算\n${e.matchup}（非保證傷害）${selectedSkill?'\n戰法：'+SKILLS[selectedSkill].name+'｜軍令 -'+SKILLS[selectedSkill].cost:''}`:`無法攻擊：${e.error}`;$('confirmAttack').disabled=!e.ok;$('attackConfirm').hidden=false;}
function clickHex(q,r){
 if(state.phase==='TACTICAL_FINISHED'||state.phase==='REACTION_PENDING'||state.phase==='DEFENSE_PENDING'||aiBusy||state.activation?.side===AI_SIDE||state.nextSide===AI_SIDE&&!state.activation)return;
 const unit=state.units.find(u=>u.q===q&&u.r===r&&!u.withdrawn&&!u.routed&&u.soldiers>0),u=unitById(selected);
 if(mode==='move'&&rangeMode==='move'&&u){const entry=reachableFor(u).find(v=>v.hex.q===q&&v.hex.r===r);if(entry){preview=stageMove(virtualActivation(u),selected,entry);msg('暫定移動：可再點其他格子，或按「取消移動」。攻擊或結束行動時才提交。');render();return;}}
 if(unit&&u&&unit.side!==u.side&&(state.activation?.unitId===u.id||canPick(u))&&attackTargetsAt(u,preview?{q:preview.q,r:preview.r}:u).some(t=>t.id===unit.id)){openAttack(unit);return;}
 if(unit){if(state.activation&&unit.side===state.activation.side&&unit.id!==state.activation.unitId){msg('已提交行動，請先結束目前部隊的行動。');return;}chooseUnit(unit);return;}
 mode=(state.activation?.unitId===selected&&!state.activation.moved||canPick(unitById(selected)))?'move':null;render();
}
$('attack').onclick=()=>{if($('attack').disabled)return;mode='attack';rangeMode='attack';msg('紅框顯示目前位置可攻擊的敵軍；點選敵軍可預覽並加入規劃。');render();};
$('rangeMode').onchange=e=>{rangeMode=e.target.value;mode=rangeMode==='move'?'move':'attack';render();};
$('planConfirm').onclick=()=>finalizePlan(false);
$('planClear').onclick=()=>{preview=null;clearPlan();mode='move';rangeMode='move';render();msg('已清除所有暫定指令，沒有消耗軍令。');};
$('confirmCancel').onclick=()=>{$('attackConfirm').hidden=true;pendingTarget=null;};
$('confirmAttack').onclick=()=>{plannedTarget=pendingTarget;pendingTarget=null;$('attackConfirm').hidden=true;mode='attack';msg('攻擊已加入行動規劃，按「確認規劃」才會正式攻擊。');render();};
$('skill').onclick=()=>{
 const u=unitById(selected),panel=$('skillDialog'),list=$('skillChoices');list.replaceChildren();
 const info=$('skillInfo');
 const note=(text)=>{const p=document.createElement('p');p.className='reaction-info';p.textContent=text;list.append(p);};
 panel.hidden=false;
 if(!u){info.textContent='尚未選擇部隊';note('請先關閉視窗，點選戰場上的藍色我方部隊，再按「武將戰法」。');return;}
 info.textContent=`${names[u.id]||u.id}｜${labels[u.type]}｜軍令 ${state.orders?.attacker??0}/5`;
 if(u.side!==PLAYER_SIDE){note('這是敵軍部隊。請選擇藍色我方部隊。');return;}
 if(state.phase==='REACTION_PENDING'){note('反應事件尚未結束，請先處理反應視窗。');return;}
 if(state.phase!=='ACTIVE'||(state.activation?.side??state.nextSide)!==PLAYER_SIDE){note('目前不是我方可行動階段。');return;}
 if(!(state.activation?.unitId===selected||canPick(u))){note('此部隊目前無法使用戰法：可能已行動或已選定其他部隊。');return;}
 if(state.activation?.mainUsed){note('此部隊本次主要行動已使用，請先結束部隊行動。');return;}
 for(const skill of availableSkills(u)){
  const b=document.createElement('button');b.type='button';
  const noOrders=(state.orders?.attacker??0)<skill.cost;
  const unavailable=skill.kind==='reaction'||skill.id==='charge'&&(!state.activation?.moved||state.activation?.movedDistance<2);
  const reason=skill.kind==='reaction'?'（反應戰法將於後續版本開放）':skill.id==='charge'&&unavailable?'（需先正式移動至少 2 格）':noOrders?'（軍令不足）':'';
  b.textContent=`${skill.name}｜軍令 ${skill.cost}｜${skill.kind==='attack'?'攻擊':skill.kind==='stance'?'防禦姿態':'反應戰法'}${reason}`;
  b.disabled=noOrders||unavailable;
  b.disabled=skill.kind==='reaction';
  b.onclick=()=>{
    const detail=document.createElement('div');detail.className='ability-detail';
    const description=skill.kind==='stance'?`本輪受到傷害減少 ${Math.round(skill.reduction*100)}%。`:skill.kind==='attack'?`攻擊傷害增加 ${Math.round(skill.bonus*100)}%。`:'受擊反應技能。';
    detail.textContent=`${skill.name}｜軍令 ${skill.cost}\n${description}\n${skill.id==='charge'?'需移動至少 2 格。':''}選取不會扣軍令，確認行動才發動。`;
    list.replaceChildren(detail);
    const back=document.createElement('button');back.textContent='返回技能列表';back.onclick=()=>$('skill').click();list.append(back);
    const add=document.createElement('button');add.textContent='加入行動規劃';add.disabled=skill.kind==='reaction'||(skill.id==='charge'&&!preview&&!state.activation?.moved)||(skill.id==='charge'&&preview&&preview.path.length<2)||(state.orders?.attacker??0)<skill.cost+(plannedCard?1:0);
    add.onclick=()=>{plannedSkill=skill.id;selectedSkill=skill.kind==='attack'?skill.id:null;if(skill.kind==='stance')plannedTarget=null;panel.hidden=true;msg(`${skill.name} 已加入規劃，尚未消耗軍令。`);render();};list.append(add);
  };
  list.append(b);
 }
 if(!list.children.length)note('此部隊尚無可使用戰法。');
};
$('skillClose').onclick=()=>{$('skillDialog').hidden=true;};
$('cards').onclick=()=>{
 const panel=$('cardDialog'),list=$('cardChoices');list.replaceChildren();panel.hidden=false;
 const u=unitById(selected),cards=state.cards?.attacker;
 $('cardInfo').textContent=`核心卡 2 張（各 3 次、冷卻 2 完整輪）｜機動牌庫 ${cards?.deck.length??0}｜手牌 ${cards?.hand.length??0}/2｜軍令 ${state.orders?.attacker??0}/5`;
 if(!u||u.side!==PLAYER_SIDE||state.phase!=='ACTIVE'||(state.activation?.side??state.nextSide)!==PLAYER_SIDE||!(state.activation?.unitId===selected||canPick(u))){const p=document.createElement('p');p.textContent='請先選擇目前可行動的我方部隊。';list.append(p);return;}
 for(const id of [...cards.core.map(c=>c.id),...cards.hand]){
  const def=CARD_POOL.find(c=>c.id===id),core=cards.core.find(c=>c.id===id),status=cardStatus(state,PLAYER_SIDE,id);
  const b=document.createElement('button');b.type='button';b.disabled=!status.ok||u.cardBuffRound===state.round;
  b.textContent=`${core?'核心':'機動'}｜${def?.name??id}｜軍令 1${core?`｜剩餘 ${core.uses} 次${state.round<core.readyRound?`｜第 ${core.readyRound} 輪可用`:''}`:''}${!status.ok?'｜'+status.error:''}`;
  b.onclick=()=>{list.replaceChildren();const detail=document.createElement('p');detail.className='ability-detail';detail.textContent=`${def?.name}｜軍令 1｜${core?'核心卡':'機動卡'}\n${id==='common-2'?'本輪防禦傷害減少 20%':'下一次攻擊傷害增加 15%'}\n確認行動時才扣除軍令與卡牌次數。`;list.append(detail);const back=document.createElement('button');back.textContent='返回卡牌列表';back.onclick=()=>$('cards').click();list.append(back);const add=document.createElement('button');add.textContent='加入行動規劃';add.disabled=(state.orders?.attacker??0)<1+(plannedSkill?SKILLS[plannedSkill].cost:0);add.onclick=()=>{plannedCard=id;panel.hidden=true;msg(`戰術卡「${def?.name}」已加入規劃，尚未消耗。`);render();};list.append(add);};list.append(b);
 }
};
$('cardClose').onclick=()=>{$('cardDialog').hidden=true;};

$('reload').onclick=()=>msg('鐵砲已改為自動裝填，不需要手動操作。');
$('undo').onclick=()=>{if(preview){preview=null;mode='move';rangeMode='move';msg('已取消暫定移動；技能與卡牌規劃保留，確認前可再調整。');render();}};
$('end').onclick=()=>finalizePlan(true);
$('pass').onclick=()=>{if(state.pending?.window){const reactUnit=state.units.find(u=>u.id===state.pending.window.candidates[0]?.unitId);if(send('PASS_REACTION',{windowId:state.pending.window.id},reactUnit?.side)){mode=null;msg('已放棄反應。');}}};
$('reset').onclick=()=>{if(!confirm('確定返回戰前編制？目前戰鬥進度將清除。'))return;openFormation();};
function reset(){chosenWeather=$('weatherSelect')?.value??'sun';selectedSkill=null;queuedAttack=null;clearPlan();rangeMode='move';aiBusy=false;aiScheduled=false;state=createTurnBattle({...buildFormationSnapshot(initial,formation),weather:chosenWeather});selected=null;mode=null;pendingTarget=null;preview=null;$('attackConfirm').hidden=true;commandNumber=0;logLines=['試玩場景已載入。請選擇藍色攻方部隊。'];msg('點選藍色部隊自由切換，黃色格子可暫定移動；紅色由普通 AI 操作。');render();}
// AI plays only the red defender; one command per timer tick keeps Safari responsive.
function queueAi(){if(aiScheduled||aiBusy||state.phase==='TACTICAL_FINISHED')return;
 if(state.phase==='DEFENSE_PENDING'){if(state.defensePending.defenderSide===AI_SIDE){aiScheduled=true;setTimeout(aiStep,220);}return;}
 const reaction=state.phase==='REACTION_PENDING';
 const reactSide=reaction?unitById(state.pending?.window?.candidates?.[0]?.unitId)?.side:null;
 if(!(reaction&&reactSide===AI_SIDE||!reaction&&(state.activation?.side??state.nextSide)===AI_SIDE))return;
 aiScheduled=true;setTimeout(aiStep,220);
}
function aiStep(){aiScheduled=false;if(state.phase==='TACTICAL_FINISHED')return;aiBusy=true;
 try{
  if(state.phase==='DEFENSE_PENDING'){const p=state.defensePending;if(p.defenderSide===AI_SIDE)send((state.orders?.defender??0)>=1?'CHOOSE_DEFENSE':'PASS_DEFENSE',{windowId:p.id,...((state.orders?.defender??0)>=1?{skillId:'phalanx'}:{})},AI_SIDE);}
  else if(state.phase==='REACTION_PENDING'){
   const candidates=state.pending.window.candidates;const c=candidates.find(c=>unitById(c.unitId)?.side===AI_SIDE);
   if(c){const target=unitById(state.pending.window.moverId??state.activation?.unitId);
    const choice=candidates.find(x=>unitById(x.unitId)?.side===AI_SIDE&&target&&validateAttack(state,x.unitId,target.id).ok);
    if(choice)send('CHOOSE_REACTION',{windowId:state.pending.window.id,unitId:choice.unitId},AI_SIDE);
    else send('PASS_REACTION',{windowId:state.pending.window.id},AI_SIDE);
   }
  }else if((state.activation?.side??state.nextSide)===AI_SIDE){
   const a=state.activation;
   if(!a){const plan=planAiActivation(state,AI_SIDE,visibleKnowledge(state,AI_SIDE),{difficulty:'normal'});if(plan)send('ACTIVATE_UNIT',{unitId:plan.unitId},AI_SIDE);else{const fallback=remainingUnits(state,AI_SIDE)[0];if(fallback)send('ACTIVATE_UNIT',{unitId:fallback},AI_SIDE);else msg('AI 無可行動部隊，請重新開始戰鬥。');}}
   else{
    const u=unitById(a.unitId),enemies=visibleKnowledge(state,AI_SIDE).visibleEnemies;
    const targetId=!a.mainUsed?chooseAiTarget(state,u.id,enemies.map(e=>e.id)):null;const target=targetId?unitById(targetId):null;
    if(target)send('ATTACK_UNIT',{unitId:u.id,targetId:target.id},AI_SIDE);
    
    else if(!a.moved&&enemies.length){const old=Math.min(...enemies.map(e=>hexDistance(u,e)));const moves=reachable(u,state).filter(m=>m.path?.length).map(m=>({...m,d:Math.min(...enemies.map(e=>hexDistance(m.hex,e)))})).filter(m=>m.d<old).sort((x,y)=>x.d-y.d||x.cost-y.cost);
      if(moves.length)send('MOVE_UNIT',{unitId:u.id,path:moves[0].path},AI_SIDE);else send('END_ACTIVATION',{},AI_SIDE);
    }else send('END_ACTIVATION',{},AI_SIDE);
   }
  }
 }catch(e){msg('AI 發生錯誤：'+e.message);console.error(e);}finally{aiBusy=false;queueAi();}
}
function renderFormation(){
 const n=SIZES[formation.size],panel=$('formationOfficers');panel.replaceChildren();
 for(const o of ROSTER){const row=document.createElement('label');row.className='formation-officer';const input=document.createElement('input');input.type='checkbox';input.checked=formation.officers.includes(o.id);input.disabled=!input.checked&&formation.officers.length>=n;input.onchange=()=>{if(input.checked)formation.officers.push(o.id);else{formation.officers=formation.officers.filter(id=>id!==o.id);if(formation.commander===o.id)formation.commander=formation.officers[0]??null;}renderFormation();};const span=document.createElement('span');span.textContent=`${o.name}｜${labels[o.type]}`;row.append(input,span);panel.append(row);}
 const sel=$('formationCommander');sel.replaceChildren();for(const id of formation.officers){const o=ROSTER.find(x=>x.id===id);const option=document.createElement('option');option.value=id;option.textContent=o.name;sel.append(option);}sel.value=formation.commander??'';
 const v=validateFormation(formation);$('formationStatus').textContent=v.ok?`已編制 ${n} 支部隊，總兵力 ${n*500} 人。敵軍同規模由 AI 指揮。`:v.error;
 $('formationStart').disabled=!v.ok;
}
function openFormation(){aiBusy=false;aiScheduled=false;$('formationDialog').hidden=false;renderFormation();}
$('formationSize').onchange=e=>{formation.size=e.target.value;const n=SIZES[formation.size];formation.officers=ROSTER.slice(0,n).map(o=>o.id);formation.commander=formation.officers[0];renderFormation();};
$('formationCommander').onchange=e=>{formation.commander=e.target.value;renderFormation();};
$('formationStart').onclick=()=>{const v=validateFormation(formation);if(!v.ok){$('formationStatus').textContent=v.error;return;}$('formationDialog').hidden=true;reset();};
openFormation();
