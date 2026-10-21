import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeMap} from './battle-core.mjs';
import {ROSTER,SIZES,BOARD_SIZES,buildFormationSnapshot} from './battle-formation.mjs';
import {createTurnBattle} from './battle-turns.mjs';
for(const [size,n] of Object.entries(SIZES))test(`D8-A3.2.1 ${size}: full ${BOARD_SIZES[size]}x${BOARD_SIZES[size]} board`,()=>{
 const snap=buildFormationSnapshot({map:makeMap(10,10),seed:'ui'}, {size,officers:ROSTER.slice(0,n).map(o=>o.id),commander:'a1'});
 assert.equal(Object.keys(snap.map.cells).length,BOARD_SIZES[size]**2);
 assert.equal(snap.units.length,n*2);
 assert.equal(new Set(snap.units.map(u=>`${u.q},${u.r}`)).size,n*2);
 assert.doesNotThrow(()=>createTurnBattle(snap));
});
test('D8-A3.2.1: range selector removed and next-unit control wired',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('./ui.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="rangeMode"|id="attack"/);
 assert.match(html,/id="nextUnit"/);
 assert.match(ui,/\$\('nextUnit'\)\.onclick=nextActionableUnit/);
 assert.match(ui,/const rkeys=new Set\(reach\.map/);
 assert.match(ui,/tkeys=possibleAttackHexes\(u\)/);
});
