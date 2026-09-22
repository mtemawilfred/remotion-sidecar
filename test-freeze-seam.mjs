// WP3 check — the mid-segment freeze seam.
//
// `chart.state` is per-segment, so freeze → teach → unfreeze is two segments.
// A playing segment ends holding the frame at `play_to` (ChartLayer's C5 Freeze),
// so the frozen segment after it must show that same moment or the chart jumps.
//
// Evals checkFreezeSeams out of the real source so this tests the shipped code
// without pulling @remotion/bundler in.
//   node test-freeze-seam.mjs
import { readFileSync } from 'fs';
import assert from 'assert';

const src = readFileSync('src/renderer.js', 'utf8');
const tol = src.match(/const SEAM_TOL_S = [^\n;]+;/);
const at  = src.match(/function chartShownAt\(chart\) \{[\s\S]*?\n\}/);
const cfs = src.match(/function checkFreezeSeams\(timeline\) \{[\s\S]*?\n\}/);
assert(tol && at && cfs, 'SEAM_TOL_S/chartShownAt/checkFreezeSeams not found — renamed?');
const checkFreezeSeams = eval(`(() => { ${tol[0]}\n${at[0]}\n${cfs[0]}\nreturn checkFreezeSeams; })()`);

const play   = (id, from, to) => ({ segment_id: id, canvas_mode: 'chart_full', chart: { play_from: from, play_to: to } });
const frozen = (id, freeze_at) => ({ segment_id: id, canvas_mode: 'chart_full', chart: { state: 'frozen', freeze_at } });

// 1. The good seam: the freeze starts exactly where the clip stopped.
assert.deepStrictEqual(checkFreezeSeams([play('s1', 0, 12.5), frozen('s2', 12.5)]), []);

// 2. The defect this exists for — a jump at the seam is rejected.
{
  const bad = checkFreezeSeams([play('s1', 0, 12.5), frozen('s2', 30)]);
  assert.strictEqual(bad.length, 1, 'a mismatched seam must be rejected');
  assert.match(bad[0], /s2/, 'the message must name the offending segment');
}

// 3. Every bad seam is reported, not just the first — one fix per run is one run wasted.
assert.strictEqual(
  checkFreezeSeams([play('a', 0, 5), frozen('b', 9), play('c', 9, 14), frozen('d', 20)]).length, 2);

// 4. Sub-frame drift is invisible, so it must not fail the render.
assert.deepStrictEqual(checkFreezeSeams([play('s1', 0, 12.5), frozen('s2', 12.504)]), []);

// 5. A frozen segment that declares nothing to freeze on is a defect too.
assert.strictEqual(checkFreezeSeams([play('s1', 0, 12.5), { segment_id: 's2', canvas_mode: 'chart_full', chart: { state: 'frozen' } }]).length, 1);

// 6. Marking through chart.overlay: the still's own timestamp is the shown moment.
assert.deepStrictEqual(
  checkFreezeSeams([play('s1', 0, 12.5), { segment_id: 's2', canvas_mode: 'chart_full', chart: { state: 'frozen', overlay: { frame_s: 12.5, marks: [] } } }]), []);
assert.strictEqual(
  checkFreezeSeams([play('s1', 0, 12.5), { segment_id: 's2', canvas_mode: 'chart_full', chart: { state: 'frozen', overlay: { frame_s: 40, marks: [] } } }]).length, 1);

// 7. Only the seam the plan names. A frozen → play or play → play discontinuity can be
//    a deliberate jump-cut in the source footage, so it is not ours to refuse.
assert.deepStrictEqual(checkFreezeSeams([frozen('s1', 5), play('s2', 30, 40)]), []);
assert.deepStrictEqual(checkFreezeSeams([play('s1', 0, 5), play('s2', 30, 40)]), []);

// 8. A graphics segment never played the clip, so the next freeze is free to start anywhere.
assert.deepStrictEqual(
  checkFreezeSeams([{ segment_id: 's1', canvas_mode: 'graphics', chart: { play_to: 5 } }, frozen('s2', 30)]), []);

// 9. Chartless segments and a single-segment timeline are not seams.
assert.deepStrictEqual(checkFreezeSeams([{ segment_id: 's1' }, frozen('s2', 30)]), []);
assert.deepStrictEqual(checkFreezeSeams([frozen('s1', 30)]), []);
assert.deepStrictEqual(checkFreezeSeams(undefined), []);

console.log('freeze seam: all assertions pass');
