// WP5 check — the retention edits that ride on the mark layer.
//
// Three things here can silently go wrong and only show up in a render:
//   * `isPlaying` drifting from the freeze-seam validator's notion of "playing",
//   * the pause/whip cues landing on the wrong side of a seam,
//   * the landmark camera putting the solver's point anywhere but frame centre.
// All three are pure functions, so they are evalled out of the real source.
//
//   node test-wp5-retention.mjs
import { readFileSync } from 'fs';
import assert from 'assert';
import { checkFreezeSeams } from './src/renderer.js';

const src = readFileSync('src/components/RepurposeLongForm.jsx', 'utf8');
const grab = (re, what) => { const m = src.match(re); assert(m, `${what} not found — renamed?`); return m[0]; };

const isPlayingSrc = grab(/const isPlaying = \(s\) => [^\n]+/, 'isPlaying');
const isFrozenSrc = grab(/const isFrozenChart = \(s\) => [^\n]+/, 'isFrozenChart');
const seamCuesSrc = grab(/const seamCues = \(rawSegs\) => rawSegs\.map[\s\S]*?\n\}\)\);/, 'seamCues');
const lmSrc = grab(/function landmarkPoint\(overlay, id\) \{[\s\S]*?\n\}/, 'landmarkPoint');
const rcSrc = grab(/function resolveCentre\(state, scale, overlay\) \{[\s\S]*?\n\}/, 'resolveCentre');

const H = `const CANVAS_W = 1920, CANVAS_H = 1080, INSET_MARGIN = 0.05;`;
const { isPlaying, seamCues, landmarkPoint, resolveCentre } = eval(
  `(() => { ${H}\n${isPlayingSrc}\n${isFrozenSrc}\n${seamCuesSrc}\n${lmSrc}\n${rcSrc}\nreturn { isPlaying, seamCues, landmarkPoint, resolveCentre }; })()`
);

const play = (id) => ({ segment_id: id, canvas_mode: 'chart_full', chart: { play_from: 0, play_to: 12 } });
const froze = (id, at = 12) => ({ segment_id: id, canvas_mode: 'chart_full', chart: { state: 'frozen', freeze_at: at } });
const gfx = (id) => ({ segment_id: id, canvas_mode: 'graphics' });

// 1. isPlaying must agree with the shipped freeze-seam validator, which is the whole
//    reason it exists as one definition. A seam the validator accepts is a seam whose
//    first half isPlaying says is playing.
{
  assert(isPlaying(play('a')), 'chart_full + not frozen is playing');
  assert(!isPlaying(froze('b')), 'a frozen chart segment is not playing');
  assert(!isPlaying(gfx('c')), 'a graphics segment is not playing');
  assert(!isPlaying({ segment_id: 'd', chart: {} }), 'no canvas_mode is not playing');
  assert.deepStrictEqual(checkFreezeSeams([play('a'), froze('b', 12)]), [],
    'a matched seam is accepted');
  assert.strictEqual(checkFreezeSeams([play('a'), froze('b', 99)]).length, 1,
    'validator must still reject a jumping seam — the same "playing" test feeds both');
}

// 2. The cues sit on the seam, one on each side, and never on the first segment.
{
  const c = seamCues([play('a'), froze('b'), play('c'), gfx('d')]);
  assert.deepStrictEqual(c[0], { pause: false, whip: false }, 'segment 0 has no seam behind it');
  assert.deepStrictEqual(c[1], { pause: true, whip: false }, 'play -> freeze announces the pause');
  assert.deepStrictEqual(c[2], { pause: false, whip: true }, 'freeze -> play whips on resume');
  assert.deepStrictEqual(c[3], { pause: false, whip: false }, 'play -> graphics is a scene change, not a pause');
}

// 3. A landmark point is read through the SAME crop mapping the marks are drawn with.
{
  const ov = { W: 1920, H: 1080, crop: [0, 0, 960, 540], marks: [{ id: 'L1', from: { point: [480, 270] } }] };
  assert.deepStrictEqual(landmarkPoint(ov, 'L1'), [960, 540], 'crop scale must be applied');
  assert.strictEqual(landmarkPoint(ov, 'nope'), null, 'an unmeasured id has no point');
  assert.strictEqual(landmarkPoint({ marks: [] }, 'L1'), null, 'no marks at all = no point');
}

// 4. The camera puts the landmark at frame centre. This is the actual claim: feed the
//    resulting transform the landmark's canvas point and it must land on (960, 540).
{
  const ov = { W: 1920, H: 1080, crop: [0, 0, 1920, 1080], marks: [{ id: 'OB', from: { point: [1200, 400] } }] };
  const s = 1.8;
  const { cx, cy } = resolveCentre({ landmark: 'OB' }, s, ov);
  const onScreen = (p) => [960 + (p[0] - 960) * s + (cx - 960), 540 + (p[1] - 540) * s + (cy - 540)];
  const [sx, sy] = onScreen([1200, 400]);
  assert(Math.abs(sx - 960) < 0.5 && Math.abs(sy - 540) < 0.5, `landmark must land at centre, got ${sx},${sy}`);
}

// 5. A landmark near the edge is clamped, so the chart never pans off and shows background.
{
  const ov = { W: 1920, H: 1080, crop: [0, 0, 1920, 1080], marks: [{ id: 'E', from: { point: [1900, 1060] } }] };
  const s = 1.2, lim = ((s - 1) * 1920) / 2, limY = ((s - 1) * 1080) / 2;
  const { cx, cy } = resolveCentre({ landmark: 'E' }, s, ov);
  assert(Math.abs(cx - 960) <= lim + 1e-6 && Math.abs(cy - 540) <= limY + 1e-6,
    'an edge landmark must clamp inside the covered area');
}

// 6. Falls back to the anchor when the landmark was never measured, or on an inset
//    (a punch-in is a zoom IN — scale < 1 keeps its anchor).
{
  const ov = { marks: [{ id: 'OB', from: { point: [100, 100] } }] };
  assert.deepStrictEqual(resolveCentre({ landmark: 'missing', anchor: 'center_right' }, 1.5, ov),
    resolveCentre({ anchor: 'center_right' }, 1.5),
    'an unmeasured landmark falls back to the anchor');
  assert.deepStrictEqual(resolveCentre({ landmark: 'OB', anchor: 'center_right' }, 0.42, ov),
    resolveCentre({ anchor: 'center_right' }, 0.42),
    'an inset ignores the landmark and keeps its anchor');
}

console.log('WP5 retention edits: all checks passed');
