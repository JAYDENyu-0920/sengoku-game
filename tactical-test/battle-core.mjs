/** Sengoku B1 V4.0-C1. Standalone, deterministic tactical movement core. */
export const DIRECTIONS = Object.freeze([[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]);
export const MOVEMENT = Object.freeze({spear:3,cavalry:5,bow:3,gun:2});
export const TERRAIN_COST = Object.freeze({
  plain:{spear:1,cavalry:1,bow:1,gun:1}, road:{spear:1,cavalry:1,bow:1,gun:1},
  forest:{spear:2,cavalry:3,bow:2,gun:2},hill:{spear:2,cavalry:2,bow:2,gun:2},
  mountain:{spear:3,cavalry:5,bow:3,gun:3},swamp:{spear:3,cavalry:4,bow:3,gun:4}
});
export const key = ({q,r}) => `${q},${r}`;
export function hexDistance(a,b){const q=a.q-b.q,r=a.r-b.r;return (Math.abs(q)+Math.abs(r)+Math.abs(q+r))/2;}
export function neighbors(h){return DIRECTIONS.map(([dq,dr])=>({q:h.q+dq,r:h.r+dr}));}
export function inBounds(h,map){return Number.isInteger(h?.q)&&Number.isInteger(h?.r)&&h.q>=0&&h.r>=0&&h.q<map.width&&h.r<map.height;}
export function makeMap(width=10,height=10,terrain='plain'){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('INVALID_MAP_SIZE');
  if(!TERRAIN_COST[terrain])throw Error('INVALID_TERRAIN');
  const cells={};for(let r=0;r<height;r++)for(let q=0;q<width;q++)cells[`${q},${r}`]={terrain,elevation:0};
  return {width,height,cells,edges:{}};
}
export function edgeKey(a,b){return [key(a),key(b)].sort().join('|');}
export function getCell(map,h){return inBounds(h,map)?map.cells[key(h)]:undefined;}
export function getEdge(map,a,b){return map.edges?.[edgeKey(a,b)]||{};}
export function isZocSource(unit){return unit.soldiers>0&&!unit.routed&&!unit.withdrawn&&unit.q!==null&&unit.r!==null;}
export function enemyZocAt(hex,unit,units){return units.some(other=>other.id!==unit.id&&other.side!==unit.side&&isZocSource(other)&&hexDistance(hex,other)===1);}
export function stepCost(unit,from,to,state){
  const {map,units=[]}=state;
  if(!inBounds(from,map)||!inBounds(to,map)||hexDistance(from,to)!==1)return Infinity;
  const cell=getCell(map,to),edge=getEdge(map,from,to);
  if(!cell||!TERRAIN_COST[cell.terrain]||!MOVEMENT[unit.type])return Infinity;
  if(edge.impassable||edge.river==='blocked'&&!edge.bridge)return Infinity;
  const road=edge.road===true;
  const base=road?1:TERRAIN_COST[cell.terrain][unit.type];
  const river=edge.river&&!edge.bridge?2:0;
  const zFrom=enemyZocAt(from,unit,units),zTo=enemyZocAt(to,unit,units);
  const zoc=zFrom?2:zTo?1:0;
  return base+river+zoc;
}
export function validatePath(unit,path,state){
  if(!Array.isArray(path)||path.length<1)return {ok:false,reason:'EMPTY_PATH'};
  if(unit.routed||unit.withdrawn||unit.soldiers<=0)return {ok:false,reason:'INACTIVE_UNIT'};
  const start={q:unit.q,r:unit.r};if(!inBounds(start,state.map))return {ok:false,reason:'INVALID_START'};
  let from=start,total=0;
  for(const to of path){
    if(!inBounds(to,state.map)||hexDistance(from,to)!==1)return {ok:false,reason:'INVALID_STEP'};
    if(state.units.some(x=>x.id!==unit.id&&!x.withdrawn&&x.soldiers>0&&x.q===to.q&&x.r===to.r))return {ok:false,reason:'OCCUPIED'};
    const cost=stepCost(unit,from,to,state);if(!Number.isFinite(cost))return {ok:false,reason:'IMPASSABLE'};
    total+=cost;if(total>MOVEMENT[unit.type])return {ok:false,reason:'MOVEMENT_EXCEEDED',cost:total};
    from=to;
  }
  return {ok:true,cost:total,destination:from};
}
export function reachable(unit,state){
  const start={q:unit.q,r:unit.r};if(!inBounds(start,state.map)||!MOVEMENT[unit.type])return [];
  const costs=new Map([[key(start),0]]),paths=new Map([[key(start),[]]]),queue=[{hex:start,cost:0}];
  while(queue.length){
    queue.sort((a,b)=>a.cost-b.cost||a.hex.r-b.hex.r||a.hex.q-b.hex.q);
    const current=queue.shift();if(current.cost!==costs.get(key(current.hex)))continue;
    for(const to of neighbors(current.hex)){
      if(!inBounds(to,state.map)||state.units.some(x=>x.id!==unit.id&&!x.withdrawn&&x.soldiers>0&&x.q===to.q&&x.r===to.r))continue;
      const step=stepCost(unit,current.hex,to,state),next=current.cost+step;
      if(next>MOVEMENT[unit.type]||next>= (costs.get(key(to))??Infinity))continue;
      costs.set(key(to),next);paths.set(key(to),[...paths.get(key(current.hex)),to]);queue.push({hex:to,cost:next});
    }
  }
  return [...costs].filter(([k])=>k!==key(start)).map(([k,cost])=>({hex:parseKey(k),cost,path:paths.get(k)})).sort((a,b)=>a.cost-b.cost||a.hex.r-b.hex.r||a.hex.q-b.hex.q);
}
function parseKey(s){const [q,r]=s.split(',').map(Number);return {q,r};}
export function canCavalryCharge(unit,path,state){return unit.type==='cavalry'&&path.length>=2&&validatePath(unit,path,state).ok&&![{q:unit.q,r:unit.r},...path].some(h=>getCell(state.map,h)?.terrain==='mountain');}
export function seedRng(seed){let x=2166136261;for(const ch of String(seed)){x^=ch.charCodeAt(0);x=Math.imul(x,16777619);}return {state:x>>>0};}
export function nextRng(rng){let x=rng.state>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;const state=x>>>0;return {rng:{state},value:state/4294967296};}
export function createBattle(snapshot){
  if(!snapshot||!snapshot.map||!Array.isArray(snapshot.units)||snapshot.units.length>8)throw Error('INVALID_SNAPSHOT');
  for(const side of ['attacker','defender'])if(snapshot.units.filter(u=>u.side===side).length>4)throw Error('TOO_MANY_UNITS');
  for(const u of snapshot.units){if(!MOVEMENT[u.type]||!Number.isInteger(u.soldiers)||u.soldiers<1||u.soldiers>500||!inBounds(u,snapshot.map))throw Error('INVALID_UNIT');}
  const ids=snapshot.units.map(u=>u.id);if(new Set(ids).size!==ids.length)throw Error('DUPLICATE_UNIT');
  if(new Set(snapshot.units.map(key)).size!==snapshot.units.length)throw Error('OVERLAPPING_UNITS');
  return {revision:0,round:1,phase:'ACTIVE',map:structuredClone(snapshot.map),units:structuredClone(snapshot.units),rng:seedRng(snapshot.seed),events:[],committedCommands:[]};
}
export function dispatch(state,command){
  if(state.committedCommands.includes(command.id))return {ok:true,state,duplicate:true};
  if(command.expectedRevision!==state.revision)return {ok:false,error:'STALE_REVISION',state};
  if(command.type!=='MOVE_UNIT')return {ok:false,error:'UNSUPPORTED_COMMAND',state};
  const unit=state.units.find(u=>u.id===command.unitId);
  if(!unit)return {ok:false,error:'UNKNOWN_UNIT',state};
  const result=validatePath(unit,command.path,state);
  if(!result.ok)return {ok:false,error:result.reason,state};
  const next=structuredClone(state),target=next.units.find(u=>u.id===unit.id);
  target.q=result.destination.q;target.r=result.destination.r;
  next.revision++;next.committedCommands.push(command.id);
  next.events.push({sequence:next.events.length+1,commandId:command.id,type:'UNIT_MOVED',unitId:unit.id,path:structuredClone(command.path),cost:result.cost});
  return {ok:true,state:next,events:next.events.slice(-1)};
}
