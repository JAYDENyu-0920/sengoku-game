import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');const ui=readFileSync(new URL('./ui.mjs',import.meta.url),'utf8');
test('reaction dialog and controls exist',()=>{for(const id of ['reactionDialog','reactionInfo','reactionCandidates','reactionPass'])assert.match(html,new RegExp(`id="${id}"`));});
test('player choices issue real reaction commands',()=>{assert.match(ui,/send\('CHOOSE_REACTION'/);assert.match(ui,/send\('PASS_REACTION'/);});
test('dialog is rendered from pending state',()=>{assert.match(ui,/function playerReaction\(/);assert.match(ui,/renderReaction\(\);/);});
