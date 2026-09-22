// WP2 check: chart marks must ACCUMULATE across segments that show the same
// frozen still, must RESET when the still changes (their frame-px anchors are
// only true on the still they were solved against), and must never double-draw.
//
// Evals carryChartMarks out of the real source so this tests the shipped code.
//   node test-chart-mark-carry.mjs
import { readFileSync } from 'fs';
import assert from 'assert';

const src = readFileSync('src/components/RepurposeLongForm.jsx', 'utf8');
const mk = src.match(/const markKey = \(m\) => [^\n]+/);
const cf = src.match(/function carryChartMarks\(rawSegs\) \{[\s\S]*?\n\}/);
assert(mk && cf, 'markKey/carryChartMarks not found — did they get renamed?');
const carryChartMarks = eval(`(() => { ${mk[0]}\n${cf[0]}\nreturn carryChartMarks; })()`);

const seg = (frame_s, ...ids) => ({ chart: { overlay: { frame_s, marks: ids.map(id => ({ id })) } } });
const ids = (ms) => ms.map(m => m.id);

// 1. Same still → the stack grows; a mark placed early is still there later.
{
  const c = carryChartMarks([seg(11, 'a'), seg(11, 'b'), seg(11, 'c')]).map(ids);
  assert.deepStrictEqual(c, [[], ['a'], ['a', 'b']], 'marks must accumulate on one still');
}

// 2. A different still resets — a frame-px anchor from still A is wrong on still B.
{
  const c = carryChartMarks([seg(11, 'a'), seg(11, 'b'), seg(40, 'x'), seg(40, 'y')]).map(ids);
  assert.deepStrictEqual(c, [[], ['a'], [], ['x']], 'a new frozen still must reset the stack');
}

// 3. Re-declaring a held mark never duplicates it (no double-draw at a seam).
{
  const c = carryChartMarks([seg(11, 'a'), seg(11, 'a', 'b'), seg(11, 'a', 'b')]).map(ids);
  assert.deepStrictEqual(c, [[], ['a'], ['a', 'b']], 'a re-declared mark must not stack twice');
}

// 4. A segment with no overlay (graphics-only, or a dropped Drive fetch) carries
//    nothing and breaks nothing — the stack survives it.
{
  const c = carryChartMarks([seg(11, 'a'), { chart: {} }, {}, seg(11, 'b')]).map(ids);
  assert.deepStrictEqual(c, [[], [], [], ['a']], 'a gap segment must not reset the stack');
}

// 5. Marks with no id fall back to a geometry signature, so identical anchors
//    still dedupe and different ones still both draw.
{
  const m = (label, pt) => ({ label, kind: 'highlight', from: { point: pt } });
  const s1 = { chart: { overlay: { frame_s: 3, marks: [m('bos', [1, 2])] } } };
  const s2 = { chart: { overlay: { frame_s: 3, marks: [m('bos', [1, 2]), m('choch', [9, 9])] } } };
  const c = carryChartMarks([s1, s2, s2]);
  assert.strictEqual(c[1].length, 1);
  assert.strictEqual(c[2].length, 2, 'un-ided marks must dedupe by anchor, not pile up');
}

// 6. An overlay with no frame key never carries — we cannot prove it is the same
//    still, and a wrongly-placed mark is worse than a missing one.
{
  const nokey = (id) => ({ chart: { overlay: { marks: [{ id }] } } });
  assert.deepStrictEqual(carryChartMarks([nokey('a'), nokey('b')]).map(ids), [[], []]);
}

console.log('chart-mark carry OK — accumulates per still, resets on a new still, never doubles');
