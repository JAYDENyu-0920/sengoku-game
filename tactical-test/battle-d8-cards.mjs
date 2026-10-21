/** D8-A3: deterministic hybrid card deck. Core: 2 fixed, 3 uses, 2 full-round cooldown. Mobile: 3 rotating, 1 starting card, 1 each round, hand max 2. */
import {CARD_POOL} from './battle-tactics.mjs';
const lookup=Object.fromEntries(CARD_POOL.map(c=>[c.id,c]));
export const CORE_CARDS=['common-1','common-2'];
export const CARD_COST=1;
export function eligibleMobile(units){
 const types=new Set(units.filter(u=>u.soldiers>0).map(u=>u.type));
 const ids=[...types].sort().flatMap(t=>CARD_POOL.filter(c=>c.group===t&&c.id.endsWith('-1')).map(c=>c.id));
 return [...ids,...['common-3','common-5','common-7']].slice(0,3);
}
export function createCardState(units){
 const mobile=eligibleMobile(units);const deck=[...mobile];
 return {core:CORE_CARDS.map(id=>({id,uses:3,readyRound:1})),mobile,deck:deck.slice(1),hand:deck.slice(0,1),discard:[],playedThisRound:[]};
}
export function drawCard(cards){
 if(cards.hand.length>=2)return;
 if(!cards.deck.length){cards.deck=cards.discard.splice(0);}
 if(cards.deck.length)cards.hand.push(cards.deck.shift());
}
export function cardStatus(s,side,id){
 const cards=s.cards?.[side],card=lookup[id];if(!cards||!card)return {ok:false,error:'UNKNOWN_CARD'};
 const core=cards.core.find(c=>c.id===id),mobile=cards.hand.includes(id);
 if(!core&&!mobile)return {ok:false,error:'CARD_NOT_IN_HAND'};
 if(core&&core.uses<=0)return {ok:false,error:'CARD_EXHAUSTED'};
 if(core&&s.round<core.readyRound)return {ok:false,error:'CARD_COOLDOWN'};
 if((s.orders?.[side]??0)<CARD_COST)return {ok:false,error:'INSUFFICIENT_ORDERS'};
 return {ok:true,core,mobile,card};
}
export function playCard(s,side,id,unitId){
 const check=cardStatus(s,side,id);if(!check.ok)return check;
 const unit=s.units.find(u=>u.id===unitId&&u.side===side&&u.soldiers>0&&!u.routed&&!u.withdrawn);
 if(!unit)return {ok:false,error:'INVALID_CARD_TARGET'};
 if(unit.cardBuffRound===s.round)return {ok:false,error:'CARD_ALREADY_APPLIED'};
 // Generic buff for initial integration: attack +15% for one attack; guard core +20% damage reduction.
 if(id==='common-2'){unit.guardUntilRound=s.round;unit.cardBuffRound=s.round;}
 else {unit.cardAttackBonus=.15;unit.cardBuffRound=s.round;}
 s.orders[side]-=CARD_COST;
 if(check.core){check.core.uses--;check.core.readyRound=s.round+3;}
 else {const cards=s.cards[side];cards.hand.splice(cards.hand.indexOf(id),1);cards.discard.push(id);}
 return {ok:true,name:check.card.name};
}
