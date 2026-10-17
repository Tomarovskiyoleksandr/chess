const assert = require('node:assert/strict');
require('./maia-core.js');
const dictionary = require('./maia-moves.json');
const {tokens, decode, mirrorMove} = globalThis.MaiaCore;
const white = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const black = white.replace(' w ', ' b ');
assert.deepEqual(tokens(white), tokens(black));
assert.equal(tokens(white).reduce((a,b) => a+b), 32);
assert.equal(tokens(white)[4*12+5], 1); // e1 white king
assert.equal(mirrorMove('a2a1n'), 'a7a8n');
const logits = new Float32Array(4352).fill(-100);
logits[dictionary.e2e4] = 2;
logits[dictionary.d2d4] = 1;
logits[dictionary.e1e8] = 100; // Illegal move must not receive probability.
const a = decode(white, ['e2e4','d2d4'], dictionary, logits, [0,0,0]);
const b = decode(black, ['e7e5','d7d5'], dictionary, logits, [0,0,0]);
assert.equal(a.moves[0].move, 'e2e4');
assert.equal(b.moves[0].move, 'e7e5');
assert.equal(a.value, .5);
assert.ok(Math.abs(a.moves.reduce((s,m)=>s+m.probability,0)-1)<1e-6);
assert.equal(a.moves[0].probability,b.moves[0].probability);
for (const move of ['e1g1','e1c1','e5d6','a7a8q','a7a8r','a7a8b','a7a8n']) {
 assert.ok(Number.isInteger(dictionary[move]), move);
 assert.equal(decode(white,[move],dictionary,logits,[0,0,0]).moves[0].probability,1);
}
assert.deepEqual(decode(white,[],dictionary,logits,[0,0,0]).moves,[]);
console.log('PASS: Maia tensor orientation, legal-only probabilities, black moves, castling, en passant, all promotions, empty position.');
