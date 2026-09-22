// WP1 check: the astronaut bubble and the burned karaoke line MUST chunk captions
// identically, and neither may drop a word. Owner ruling (beginner-explainer v4):
// no word cap, never shorten caption text to fit the bubble.
//
// Evals captionChunks out of the real source so this tests the shipped code.
//   node test-caption-chunks.mjs
import { readFileSync } from 'fs';
import assert from 'assert';

const src = readFileSync('src/components/RepurposeLongForm.jsx', 'utf8');
const m = src.match(/function captionChunks\(captions\) \{[\s\S]*?\n\}/);
assert(m, 'captionChunks not found in RepurposeLongForm.jsx — did it get renamed?');
const captionChunks = eval(`(${m[0].replace('function captionChunks', 'function')})`);

const words = (s) => s.split(' ').map((word, i) => ({ word, start: i * 0.4, end: i * 0.4 + 0.35 }));
const flat = (chunks) => chunks.flat().map(c => c.word).join(' ');

// 1. No word is ever dropped — the whole point of "never shorten caption text".
for (const text of [
  'price sweeps the high then closes back below it fast',
  'a long uninterrupted clause with absolutely no punctuation anywhere in it at all really',
  'Stop.',
  'one two three, four five six, seven eight nine ten eleven twelve thirteen',
  'supercalifragilisticexpialidocious liquidity',
]) {
  const chunks = captionChunks(words(text));
  assert.strictEqual(flat(chunks), text, `text lost when chunking: "${text}"`);
  assert(chunks.every(c => c.length > 0), 'empty chunk produced');
}

// 2. Punctuation breaks once >=3 words; otherwise every 6. Guards the "same chunk
//    count, same word timings" ruling against a future word cap creeping back in.
assert.deepStrictEqual(
  captionChunks(words('a b c, d e f g h')).map(c => c.length), [3, 5],
  'comma landing on the 3rd word must break the line there'
);
assert.deepStrictEqual(
  captionChunks(words('a b, c d e f g h')).map(c => c.length), [6, 2],
  'comma on the 2nd word must NOT break — the >=3 rule declines it'
);
assert.deepStrictEqual(
  captionChunks(words('a, b c d e f g')).map(c => c.length), [6, 1],
  'a comma before the 3rd word must NOT break — the 6-word rule applies'
);
assert.deepStrictEqual(
  captionChunks(words('one two three four five six seven')).map(c => c.length), [6, 1],
  'unpunctuated text breaks every 6 words'
);

// 3. Both looks read the same chunk list, so the bubble can never show a
//    different number of lines than the burned captions would have.
const cs = words('sweep the high, then close below and continue lower');
assert.strictEqual(flat(captionChunks(cs)), cs.map(c => c.word).join(' '));

console.log('caption chunking OK — no text dropped, break rules intact');
