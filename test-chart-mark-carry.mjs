// WP2 check (Owner ruling: re-anchor by object). The bar is a trading platform --
// a drawing stays stuck to the chart: it keeps its place through a scroll, leaves
// frame when the chart scrolls past it, and never re-animates when it comes back.
//
// What travels forward is HELD-NESS, not geometry. Position always comes from the
// point the solver measured for the current still; the one carry-verbatim case is a
// mark the solver stopped declaring while the chart is on the SAME still.
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

// a mark id plus the point the solver measured for it on THIS still
const m = (id, x) => ({ id, from: { point: [x, 10] } });
const seg = (frame_s, ...marks) => ({ chart: { overlay: { frame_s, marks } } });
const heldOf = (r) => (r ? r.held.slice().sort() : null);
const carriedOf = (r) => (r ? r.carried.map((k) => k.id).sort() : null);

// 1. First sighting is NOT held — it must still play its entrance.
{
  const [a] = carryChartMarks([seg(11, m('bsl', 30))]);
  assert.deepStrictEqual(heldOf(a), [], 'a mark must animate in on its first segment');
}

// 2. Re-declared on a LATER STILL: held (no replay) and the new point is what draws.
//    This is the whole ruling -- the scroll moves the drawing, it does not reintroduce it.
{
  const out = carryChartMarks([seg(11, m('bsl', 30)), seg(40, m('bsl', 210))]);
  assert.deepStrictEqual(heldOf(out[1]), ['bsl'], 'a re-measured mark must stay held across a still change');
  assert.deepStrictEqual(carriedOf(out[1]), [], 'it is declared here, so it must not also be carried');
}

// 3. Same still, solver stopped declaring it -> carried verbatim; its point is still true.
{
  const out = carryChartMarks([seg(11, m('bsl', 30)), seg(11, m('choch', 80))]);
  assert.deepStrictEqual(carriedOf(out[1]), ['bsl'], 'an undeclared mark must carry on the same still');
  assert.strictEqual(out[1].carried[0].from.point[0], 30, 'it must carry its own measured point');
}

// 4. New still and the solver does NOT re-measure it -> DROPPED. A frame-px anchor
//    from another still is not true here, and absent beats wrong.
{
  const out = carryChartMarks([seg(11, m('bsl', 30)), seg(40, m('choch', 80))]);
  assert.deepStrictEqual(carriedOf(out[1]), [], 'an un-remeasured mark must NOT cross a still boundary');
  assert.deepStrictEqual(heldOf(out[1]), [], 'and it is not held either -- it is simply gone');
}

// 5. Gone, then re-measured later: held, never re-animated. (Scrolled off, scrolled back.)
{
  const out = carryChartMarks([seg(11, m('bsl', 30)), seg(40, m('choch', 80)), seg(70, m('bsl', 12))]);
  assert.deepStrictEqual(heldOf(out[2]), ['bsl'], 'a returning mark must come back held, not replayed');
}

// 6. Accumulation on one still, and nothing ever double-draws.
{
  const out = carryChartMarks([seg(11, m('a', 1)), seg(11, m('b', 2)), seg(11, m('c', 3))]);
  assert.deepStrictEqual(carriedOf(out[2]), ['a', 'b'], 'marks must accumulate on one still');
  assert.deepStrictEqual(heldOf(out[2]), [], 'c is new here');
  const both = out[2].carried.map((k) => k.id).filter((id) => id === 'c');
  assert.strictEqual(both.length, 0, 'the declared mark must never also appear as carried');
}

// 7. A segment with no overlay (graphics-only, or a dropped Drive fetch) yields null
//    and breaks nothing -- the layer survives it.
{
  const out = carryChartMarks([seg(11, m('a', 1)), { chart: {} }, {}, seg(11, m('b', 2))]);
  assert.strictEqual(out[1], null);
  assert.deepStrictEqual(carriedOf(out[3]), ['a'], 'a gap segment must not clear the layer');
}

// 8. No frame key at all: we cannot prove which still a point belongs to, so a mark
//    is never carried verbatim -- but a re-declared one is still held.
{
  const nokey = (...marks) => ({ chart: { overlay: { marks } } });
  const out = carryChartMarks([nokey(m('a', 1)), nokey(m('a', 9), m('b', 2))]);
  assert.deepStrictEqual(carriedOf(out[1]), [], 'no frame key means no verbatim carry');
  assert.deepStrictEqual(heldOf(out[1]), ['a'], 'a re-declared mark is still held without a key');
}

// 9. Un-ided marks fall back to a label+kind+anchor signature. Identical anchors on
//    the same still are recognised...
{
  const u = (label, pt) => ({ label, kind: 'highlight', from: { point: pt } });
  const s1 = { chart: { overlay: { frame_s: 3, marks: [u('bos', [1, 2])] } } };
  const s2 = { chart: { overlay: { frame_s: 3, marks: [u('bos', [1, 2]), u('choch', [9, 9])] } } };
  const out = carryChartMarks([s1, s2]);
  assert.strictEqual(out[1].held.length, 1, 'an identical un-ided mark must be recognised as held');
}

// 10. ...but a re-measured mark has a DIFFERENT point, so without a stable id its
//     identity does not survive the move. THIS IS THE CONTRACT: for a mark to
//     re-anchor across stills the solver MUST emit a stable id (the ledger's
//     object_uid). Without one it reads as a brand-new mark and replays its
//     entrance -- visible as a drawing that re-animates every time the chart scrolls.
{
  const u = (label, pt) => ({ label, kind: 'highlight', from: { point: pt } });
  const out = carryChartMarks([
    { chart: { overlay: { frame_s: 3, marks: [u('bos', [1, 2])] } } },
    { chart: { overlay: { frame_s: 9, marks: [u('bos', [40, 2])] } } },
  ]);
  assert.deepStrictEqual(out[1].held, [], 'an un-ided mark cannot re-anchor across stills -- ids are required');

  const out2 = carryChartMarks([
    { chart: { overlay: { frame_s: 3, marks: [{ ...u('bos', [1, 2]), id: 's1.level.01' }] } } },
    { chart: { overlay: { frame_s: 9, marks: [{ ...u('bos', [40, 2]), id: 's1.level.01' }] } } },
  ]);
  assert.deepStrictEqual(out2[1].held, ['s1.level.01'], 'with a stable id the same drawing survives the scroll');
}

console.log('chart-mark layer OK — held-ness travels, geometry does not; absent beats wrong');
