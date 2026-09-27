// ── PGPresentation.jsx ─────────────────────────────────────────────────────────
// PipsGravity "Play, Hold, Mark" long-form (1920×1080 @ 30fps). NEW composition, separate from
// RepurposeLongForm so that one stays available for rollback. Uses no shared primitives (nothing shared edited).
//
// IN (props, built by PipsGravity overlay/render-props.mjs from a VALIDATED edit-list@0.1.0):
//   { fps, durationInFrames, src:{w,h}, video, audio, beats[], captions[{w,a,z,gold?}], chapters[] }
//   beat = { id, a, z (narration ms), mode: hold|play|replay, from_ms, to_ms, cut, marks[], graphic, camera }
//   mark = { kind, at_ms, box:[x0,y0,x1,y1] in SOURCE px, below, text, carried }
//   beat.treatments[] + graphic.{treatment, parts[], steps[], layout:{mode band|quiet|push, box?[x,y,w,h] screen px}, seam}
//   (Phase 7.1: band / quiet cards leave the chart still; a seam joins two consecutive cards, never both on screen)
//   Phase 7.2: mode rewind (+ rewind_style) steps frames; camera {kind zoom|spotlight, scale, box, text}; beat.rr {entry_y,
//   stop_y, x0, x1, series[{at, on, dx, best_y}]}; beat.predict {answer, at[x,y]}; mark.tone warn|confirm, mark.meaning (term),
//   path mark {ghost, hold_end, reality_ms}, cross mark taken_ms (replay pop-away)
//   Phase 7.3 hooks: beat.finished {entry[x,y], target[x,y], r, long, at}; beat.trap {stops[[x,y]x5], size, at};
//   beat.question {text, pin[x,y]}; beat.contrast {video, src{w,h}, from_ms, real a|b, question, labels[2]}
// OUT: the video. The sidecar only draws; every time and position is decided upstream.
//
// Motion values follow the Play/Hold/Mark design v2 (PROPOSED, not approved standards): hold signal = white flash
// 0.8 -> 0 over 0.13 s + grey drain 0.7 s; marks draw on over 500 ms ease-out, 100 ms before the word;
// a mark dims to 40% after its beat and is gone one beat later (carried marks stay), and every mark goes on a cut.
// pt70 FLOOR (Owner: the prototype temp/PG_Master_Animated_Presentation_Prototype is the base, effects layer on top):
// blurred ambient chart behind everything; every beat has its own eased framing (never a parked chart); a side card slides
// the chart into a 63% column; no editing-mechanics chips; every card text fits its box (no overflow, no ellipsis).
import React from 'react';
import { AbsoluteFill, Audio, Easing, Freeze, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Video } from '@remotion/media';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';
// the Owner-approved short-form product pop-up (RepurposeScene), reused unchanged: same word match, same motion curve
import { productWindow, productPopupState } from './RepurposeScene';

// the design names Inter + Oswald; unloaded, the render box silently falls back to Arial/Impact
const { fontFamily: INTER } = loadInter('normal', { weights: ['700', '800'], subsets: ['latin'] });
const { fontFamily: OSWALD } = loadOswald('normal', { weights: ['700'], subsets: ['latin'] });
const W = 1920, H = 1080, NAVY = '#1B2A4A', GOLD = '#C9A84C', RED = '#C0392B', GREEN = '#1E8449', INK = '#0F172A';
const HEAD = `${OSWALD}, Impact, sans-serif`, BODY = `${INTER}, Arial, sans-serif`;
const DRAW_MS = 500, LEAD_MS = 100, EASE_MS = 1000;
// FLOOR (prototype): chart column 63% when a side card is up; camera eases 850 ms per beat, creeps 2.5% through the beat
const COL = 0.63, CAM_MS = 850, CREEP = 1.025, CAM_Z = [1.06, 1.12, 1.03, 1.15, 1.08, 1.1], CHAPTER_MS = 3200;
const PANEL = { x: Math.round(W * 0.645), y: 96, w: Math.round(W * 0.325), h: 780 }; // right column, clear of the captions
// cards that sit beside the chart (the chart slides left for them); every other graphic is a full-frame cut
const SIDE = new Set(['definition', 'spine', 'quick', 'mistake', 'tease', 'astro', 'p-statement', 'p-list', 'p-compare']);
// a beat's framing: centred on everything drawn on this frame (its marks + marks still up since the last cut + treatment
// points), zoomed no further than keeps all of it inside 84% of the chart. Rewinds / contrasts stay at 1x.
function beatCam(beats, i, src) {
  const b = beats[i], pts = [];
  for (let j = i; j >= 0; j--) { beats[j].marks.forEach((m) => { if (j === i || m.carried || j === i - 1) pts.push(m.box.slice(0, 2), m.box.slice(2, 4)); }); if (beats[j].cut) break; }
  const g = b.graphic, add = (xy) => xy && pts.push(xy);
  b.trap?.stops.forEach(add); add(b.finished?.entry); add(b.finished?.target); add(b.question?.pin); add(b.predict?.at); add(g?.pin);
  if (b.rr) pts.push([b.rr.x0, b.rr.entry_y], [b.rr.x1, b.rr.stop_y], [b.rr.x1, Math.min(...b.rr.series.map((s) => s.best_y))]);
  if (b.camera?.box && b.camera.kind !== 'spotlight') { const [x0, y0, x1, y1] = b.camera.box; return { z: b.camera.scale, fx: (x0 + x1) / 2, fy: (y0 + y1) / 2 }; }
  if (b.mode === 'rewind' || b.contrast || b.camera?.kind === 'spotlight') return { z: 1, fx: src.w / 2, fy: src.h / 2 };
  let fx = src.w / 2, fy = src.h / 2, zmax = 1.17;
  const ok = pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (ok.length) {
    const xs = ok.map((q) => q[0]), ys = ok.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    fx = (x0 + x1) / 2; fy = (y0 + y1) / 2; zmax = Math.min(zmax, (src.w * 0.84) / Math.max(1, x1 - x0), (src.h * 0.84) / Math.max(1, y1 - y0));
  }
  return { z: Math.max(1, Math.min(CAM_Z[i % CAM_Z.length], zmax)), fx, fy };
}
// Text that must fit its box (Owner pt70: no overflow, no "..."). Largest size <= base where every word fits the width and the
// whole string fits `lines` lines. ponytail: width is estimated (Inter 800 caps ~0.68 em, mixed ~0.58 em), not measured;
// swap for a canvas measureText if the card font changes.
const fitSize = (text, w, base, min = 20, lines = 1) => {
  const s = String(text || ''), em = s === s.toUpperCase() ? 0.7 : 0.6, words = s.split(/\s+/).filter(Boolean);
  const longest = Math.max(1, ...words.map((x) => x.length));
  return Math.floor(Math.max(min, Math.min(base, w / (longest * em), (w * lines * 0.92) / (Math.max(1, s.length) * em))));
};
const url = (s) => (/^https?:/.test(s) ? s : staticFile(s));
const c01 = (x) => Math.max(0, Math.min(1, x));
const out = Easing.out(Easing.cubic), io = Easing.inOut(Easing.cubic); // = the design demos' eo / eio
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// Phase 7.2 chart treatments, ported from the design v2 demos (context/design/phm_treatment_specs/<id>.js). Demo px are at
// 960x540: every size below is x2. Colours = the demo kit K (retention-doc colours; Owner v3 ruling for the R counter).
const KR = '#d64541', KB = '#0080FF', KBEAR = '#151a22', KI = '#121822', KG = '#667080', KCY = '#89c7d7', KGRID = '#e8ebef', KL = '#7b8592';
const MONO = 'ui-monospace, Consolas, "DejaVu Sans Mono", monospace';
// C1 OPEN (Owner ruling pending): the demos pop the zoom / predict chips with back() overshoot; Cut Sheet C1 bans overshoot.
// Ported verbatim; false = every 7.2 pop becomes a plain ease-out.
const OVERSHOOT = true;
const CUTAWAYS_ENABLED = true; // Owner ruling 2026-09-23: PHM restores earned full-screen b-roll; RepurposeLongForm remains the rollback
const back = (p) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;
const popS = (p) => 0.7 + 0.3 * (OVERSHOOT ? back(c01(p)) : out(c01(p)));

export const PGPresentation = (p) => {
  const frame = useCurrentFrame(), fps = p.fps, now = (frame / fps) * 1000, f = (ms) => Math.round((ms * fps) / 1000);
  // product (side quest 2026-09-24, Owner): naming the "Mastermind Trading Plan" plays the short-form pop-up, triggered by the
  // spoken words (first mention at or after 90 s, budget 1). A text card that names the product is dropped: the pop-up replaces it.
  const promoWin = React.useMemo(() => productWindow(p.captions.filter((w) => w.a >= PRODUCT_NOT_BEFORE).map((w) => ({ word: w.w, start: w.a / 1000 }))), [p.captions]);
  // pt70c: a card under the pop-up read as two graphics at once (2:22 p-diagram behind the blur) -> the pop-up's window owns the screen
  const under = (b) => promoWin && b.a < promoWin.end * 1000 && b.z > promoWin.start * 1000 && !['a-chapter', 'p-endcard'].includes(b.graphic?.treatment);
  const beats = React.useMemo(() => p.beats.map((b) => (b.graphic && (/mastermind/i.test(JSON.stringify(b.graphic)) || under(b)) ? { ...b, graphic: null } : b)), [p.beats, promoWin]);
  const promo = productPopupState(now / 1000, promoWin);
  const { src } = p, S = Math.min(W / src.w, H / src.h), cw = src.w * S;
  const k = Math.max(0, beats.findIndex((b) => now >= b.a && now < b.z)), beat = beats[k];
  const endcardOn = beat.graphic?.treatment === 'p-endcard';
  // 7.4 step rail: while it is up it owns the top edge (the chapter chip gives way)
  const railOn = !endcardOn && !!p.rail && now >= p.rail.at[0].a && now < p.rail.z;

  // FLOOR (pt70, temp/PG_Master_Animated_Presentation_Prototype): a side card never squeezes into the band beside the chart;
  // the chart slides left into the prototype's 63% column at full height and the card owns the right column.
  const pushed = beats.filter((b) => SIDE.has(b.graphic?.treatment)).reduce((acc, b) => {
    const last = acc.at(-1); if (last && last[1] === b.a) last[1] = b.z; else acc.push([b.a, b.z]); return acc; }, []);
  const push = Math.max(0, ...pushed.map(([a, z]) => io(c01((now - a) / 600)) * io(c01((z - now) / 600))));
  const scP = Math.min(COL * W / src.w, H / src.h);
  const sc = interpolate(push, [0, 1], [S, scP]), left = interpolate(push, [0, 1], [(W - cw) / 2, (COL * W - src.w * scP) / 2]), top = (H - src.h * sc) / 2;

  // FLOOR camera: every beat has its own framing (prototype scene scales 1.02-1.17 around what the beat marks), eased
  // 850 ms from the last one, then a slow 2.5% creep, so the picture is never parked. An explicit beat.camera zoom
  // (design D.zoom) is the same move with the planner's scale; spotlight (D.spotlight) keeps its own 600 ms fade.
  const cams = React.useMemo(() => beats.map((b, i) => beatCam(beats, i, src)), [beats, src]);
  const bp = out(c01((now - beat.a) / CAM_MS)), creep = (x) => 1 + (CREEP - 1) * io(c01(x));
  const c0 = cams[k - 1] || cams[k], c1 = cams[k], q = (now - beat.a) / Math.max(1, beat.z - beat.a);
  const zoom = interpolate(bp, [0, 1], [c0.z * CREEP, c1.z]) * creep(q);
  const fx = interpolate(bp, [0, 1], [c0.fx, c1.fx]), fy = interpolate(bp, [0, 1], [c0.fy, c1.fy]);
  // pan the focus to the centre only as far as the zoomed video still covers the chart box (a video has nothing past its edge)
  const tx = Math.max(src.w * (1 - zoom), Math.min(0, src.w / 2 - zoom * fx)), ty = Math.max(src.h * (1 - zoom), Math.min(0, src.h / 2 - zoom * fy));
  const cam = beat?.camera?.box && beat.camera;
  const zk = cam && cam.kind !== 'spotlight' ? bp * io(c01((beat.z - now) / EASE_MS)) : 0;
  const spot = cam?.kind === 'spotlight' ? io(c01((now - beat.a) / 600)) * io(c01((beat.z - now) / 600)) : 0;
  // source px -> screen px (push + camera), for chips drawn outside the zoomed layer
  const toScreen = ([x, y]) => [left + sc * (tx + zoom * x), top + sc * (ty + zoom * y)];
  const box = { left, top, width: src.w * sc, height: src.h * sc };
  // hold signal: first frame of a hold on a new frame (predict flashes too: "the freeze flash when the question lands")
  const t0 = now - beat.a, signal = beat.mode === 'hold' && beat.cut;
  const grey = signal && t0 < 800 ? 1 - c01((t0 - 100) / 700) : 0;
  const flash = signal || beat.predict || beat.question ? Math.max(0, 0.8 - t0 / 130 * 0.8) : 0; // D.question: freezeFx on the freeze
  // rewind (D.rewind): stepped frames, NEVER a negative playbackRate; dramatic = grey 0.6 + shake + scanlines + REWIND chip
  const rw = beat.mode === 'rewind', drama = rw && beat.rewind_style === 'dramatic';
  const rwA = rw ? c01(t0 / 150) * (1 - c01((now - beat.z + 300) / 300)) : 0;
  const shake = drama ? Math.sin((now / 1000) * 90) * 6 : 0;
  const filt = [grey && `grayscale(${grey.toFixed(2)})`, drama && 'grayscale(0.6)'].filter(Boolean).join(' ');

  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      {/* FLOOR ambient: the beat's own frame, blurred and dimmed, fills the frame behind the chart (prototype .ambient:
          blur 38 px, brightness .57). Drawn at 1/4 size and scaled up: the same look for a fraction of the blur cost. */}
      <div style={{ position: 'absolute', left: -W * 0.1, top: -H * 0.1, width: W * 0.3, height: H * 0.3, transform: 'scale(4)', transformOrigin: '0 0',
        filter: 'blur(9px) brightness(.55) saturate(.85)' }}>
        {beats.map((b) => (
          <Sequence key={`amb.${b.id}`} from={f(b.a)} durationInFrames={Math.max(1, f(b.z) - f(b.a))} layout="none">
            <Freeze frame={0}><Clip src={p.video} from={f(b.from_ms)} cover /></Freeze>
          </Sequence>
        ))}
      </div>
      <AbsoluteFill style={{ background: 'linear-gradient(90deg,rgba(9,15,25,.45),transparent 18%,transparent 82%,rgba(9,15,25,.45))' }} />
      <div style={{ position: 'absolute', left, top, width: src.w, height: src.h, overflow: 'hidden', borderRadius: 10 / sc,
        boxShadow: '0 25px 60px rgba(0,0,0,.55)', transform: `translateX(${shake}px) scale(${sc})`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', inset: 0, transform: `translate(${tx}px, ${ty}px) scale(${zoom})`, transformOrigin: '0 0',
          filter: filt || undefined }}>
          {beats.map((b) => (
            <Sequence key={b.id} from={f(b.a)} durationInFrames={Math.max(1, f(b.z) - f(b.a))} layout="none">
              {b.mode === 'hold' || b.mode === 'broll' ? <Freeze frame={0}><Clip src={p.video} from={f(b.from_ms)} /></Freeze>
                : b.mode === 'rewind' ? <Freeze frame={0}><Clip src={p.video} from={f(b.from_ms + (b.to_ms - b.from_ms) * io(c01((now - b.a) / (b.z - b.a))))} /></Freeze>
                : <Clip src={p.video} from={f(b.from_ms)} rate={(b.to_ms - b.from_ms) / (b.z - b.a)} />}
            </Sequence>
          ))}
          <svg viewBox={`0 0 ${src.w} ${src.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            {spot > 0 && <Spotlight box={cam.box} src={src} k={spot} u={1 / S} />}
            {beat.rr && <RCounter b={beat} now={now} u={1 / S} />}
            {beat.question && <QWash b={beat} now={now} src={src} u={1 / S} />}
            <Marks beats={beats} now={now} u={1 / S} />
            {beat.trap && <TrapStops b={beat} now={now} u={1 / S} />}
            {beat.finished && <Finished b={beat} now={now} u={1 / S} />}
            {beat.question?.pin && <QPin b={beat} now={now} u={1 / S} />}
          </svg>
        </div>
      </div>
      {zk > 0 && <div style={{ position: 'absolute', ...box, background: `radial-gradient(circle at 50% 50%, rgba(18,24,34,0) ${box.height * 0.3}px, rgba(18,24,34,${(0.25 * zk).toFixed(3)}) ${box.height * 0.9}px)` }} />}
      {drama && rwA > 0 && <div style={{ position: 'absolute', ...box, opacity: rwA, background: 'repeating-linear-gradient(0deg, rgba(18,24,34,.07) 0 4px, transparent 4px 12px)' }} />}
      {cam?.text && (() => { // zoom label follows the transformed mark (pop, D.zoom); spotlight label sits beside the mark
        const [x0, y0, x1, y1] = cam.box, zoomed = cam.kind === 'zoom', ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
        const pz = c01((now - beat.a - CAM_MS) / 400), a = zoomed ? pz * (1 - c01((now - (beat.z - EASE_MS - 400)) / 300))
          : c01((now - beat.a - 500) / 400) * (1 - c01((now - beat.z + 800) / 300));
        const [x, y] = zoomed ? toScreen([ox, y0]) : toScreen([x1, oy]);
        return a > 0 && <KChip bg={zoomed ? KR : KI} size={zoomed ? 32 : 30} style={{ left: x + (zoomed ? 60 : 16), top: y + (zoomed ? 52 : 0), opacity: a,
          transform: `translateY(-50%) scale(${zoomed ? popS(pz) : 1})` }}>{cam.text.toUpperCase()}</KChip>;
      })()}
      {beat.predict && <Predict b={beat} now={now} box={box} />}
      {beat.trap && <Stamp b={beat} now={now} box={box} />}
      {beat.question && <QText b={beat} now={now} box={box} band={(W - cw) / 2} />}
      {(() => { const pb = beats[k - 1]; if (!pb?.predict || beat.mode === 'hold') return null; // the answer, as it plays on
        const ag = c01((now - beat.a - 100) / 300), a = ag * (1 - c01((now - beat.a - 2600) / 400)), [x, y] = toScreen(pb.predict.at), up = pb.predict.answer === 'up';
        return a > 0 && <KChip bg={up ? KB : KBEAR} size={36} style={{ left: x + 36, top: y, opacity: a, transform: `translateY(-50%) scale(${popS(ag)})` }}>IT WENT {up ? 'UP' : 'DOWN'}</KChip>; })()}
      {/* Owner pt70: no editing-mechanics chips (HELD / REPLAY x / SOURCE s -> s / REWIND). The viewer sees the lesson, not the edit. */}
      {flash > 0 && <AbsoluteFill style={{ background: '#fff', opacity: flash }} />}
      {beats.map((b, i) => b.graphic && now >= b.a - 400 && now < b.z + 300 && (() => {
        const next = beats[i + 1], seamOut = next?.graphic && next.a === b.z ? next.graphic.seam : null;
        const P = PRES[b.graphic.treatment];
        if (P) return <P key={b.id} b={b} now={now} box={PANEL} band railOn={railOn} toScreen={toScreen} video={p.video} src={src} f={f} captions={p.captions} />;
        return <Card key={b.id} b={b} now={now} box={PANEL} seamOut={seamOut} />;
      })())}
      {beats.map((b) => b.contrast && (
        <Sequence key={`c.${b.id}`} from={f(b.a)} durationInFrames={Math.max(1, f(b.z) - f(b.a))} layout="none">
          <Contrast b={b} now={now} video={p.video} src={src} f={f} />
        </Sequence>
      ))}
      {/* ponytail: the running stack gives way to a side card (both want the right column); stack cards return at the next stack beat */}
      {!endcardOn && push === 0 && p.stack && <Stack cards={p.stack} now={now} />}
      {railOn ? <Rail r={p.rail} now={now} box={box} /> : (endcardOn || (beat.graphic?.treatment === 'a-chapter' && now < beat.a + CHAPTER_MS)) ? null : <Chapter chapters={p.chapters} now={now} />}
      {promo.blur > 0 && <Product s={promo} />}
      {CUTAWAYS_ENABLED && beats.filter((b) => b.mode === 'broll').map((b) => (
        <Sequence key={`broll.${b.id}`} from={f(b.a)} durationInFrames={Math.max(1, f(b.z) - f(b.a))} layout="none">
          <Broll b={b} fps={fps} assets={p.assets} />
        </Sequence>
      ))}
      <Captions words={p.captions} now={now} fps={fps} />
      <Audio src={url(p.audio)} />
    </AbsoluteFill>
  );
};

// Phase 7.6: RepurposeLongForm's MemeCutaway asset contract, but with the approved PHM demo motion:
// 450 ms left-to-right wipe, then a 300 ms blurred whip left. The chart underneath is the beat's one frozen source frame.
function Broll({ b, fps, assets }) {
  const frame = useCurrentFrame(), ms = (frame / fps) * 1000, len = b.z - b.a, a = (assets || {})[b.broll?.asset];
  if (!a?.url) return null;
  const wipe = interpolate(ms, [0, 450], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: io });
  const outAt = Math.max(450, len - 300);
  const whip = interpolate(ms, [outAt, len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  if (whip >= 1) return null;
  const media = String(a.media_type || '').startsWith('video')
    ? <Video src={url(a.url)} muted loop objectFit="cover" style={{ position: 'absolute', inset: 0, width: W, height: H }} />
    : <Img src={url(a.url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  return <>
    <AbsoluteFill style={{ zIndex: 50, overflow: 'hidden', clipPath: `inset(0 ${(100 - wipe * 100).toFixed(3)}% 0 0)` }}>
      <AbsoluteFill style={{ background: '#101b2e', transform: `translateX(${-whip * W}px)`, filter: `blur(${(whip ** 3 * 24).toFixed(1)}px)` }}>
        {media}
      </AbsoluteFill>
    </AbsoluteFill>
    {wipe < 1 && <div style={{ position: 'absolute', zIndex: 51, left: wipe * W - 4, top: 0, width: 8, height: H, background: GOLD }} />}
  </>;
}

// ── product pop-up: RepurposeScene ProductPopup's card, motion and blur/dim, laid out for 1920x1080. The short-form sizes
// were % of a 1080-wide stage (cqw); here one unit Q = 9 px so the square card (702 px) sits centred above the captions.
// Blur is a backdrop over everything drawn before it (chart, marks, cards, chips); captions are drawn after and stay sharp.
const PRODUCT_NOT_BEFORE = 90000, Q = 9, POPUP_BLUR_PX = 40, POPUP_DIM = 0.35;
function Product({ s }) {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ backdropFilter: `blur(${(s.blur * POPUP_BLUR_PX).toFixed(1)}px)`, background: `rgba(6,10,18,${(s.blur * POPUP_DIM).toFixed(3)})` }} />
      <div style={{ position: 'absolute', left: (W - 78 * Q) / 2, top: 84, width: 78 * Q, opacity: s.opacity,
        transform: `translate(${s.x}%, ${s.y * 0.5 * Q}px) rotate(${s.rot}deg)` }}>
        <div style={{ background: '#FFFFFF', borderRadius: 4 * Q, padding: 3 * Q,
          boxShadow: `0 ${5 * Q}px ${10 * Q}px ${-3 * Q}px rgba(0,0,0,.6), 0 0 0 ${0.3 * Q}px rgba(255,255,255,.6)` }}>
          <Img src={staticFile('assets/products/mastermind_trading_plan.png')} style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 4 * Q, mixBlendMode: 'soft-light', backgroundSize: '250% 100%',
          backgroundImage: 'linear-gradient(105deg,transparent 40%,rgba(255,255,255,.75) 50%,transparent 60%)', backgroundPosition: `${s.sweep}% 0` }} />
      </div>
    </AbsoluteFill>
  );
}

const Clip = ({ src, from, rate = 1, cover }) => (
  <OffthreadVideo src={url(src)} startFrom={from} playbackRate={rate} muted style={{ width: '100%', height: '100%', display: 'block', objectFit: cover ? 'cover' : undefined }} />
);

// ── marks: SVG in source px, strokes in screen px (non-scaling); u = source px per 1080p screen px ─────────
function Marks({ beats, now, u }) {
  const live = [];
  beats.forEach((b, k) => b.marks.forEach((m, i) => {
    const cutAt = beats.slice(k + 1).find((x) => x.cut)?.a ?? Infinity, next = beats[k + 1];
    let gone = m.carried ? cutAt : Math.min(cutAt, next ? next.z : b.z);
    if (m.reality_ms != null) gone = Math.max(gone, m.reality_ms + 800); // the ghost path stays until REALITY has landed
    if (now < m.at_ms - LEAD_MS || now >= gone) return;
    // opacity: dims to 40% after its beat; a ghost fades with its payoff; a stop x pops away as the replay takes it (D.replay)
    const o = (m.reality_ms != null ? 1 - c01((now - m.reality_ms - 200) / 600) : now >= b.z && !m.carried ? 0.4 : 1);
    const sw = m.taken_ms != null ? c01((now - m.taken_ms) / 400) : 0;
    live.push({ ...m, key: `${b.id}.${i}`, now, u, sw, t: now - m.at_ms + LEAD_MS, p: out(c01((now - m.at_ms + LEAD_MS) / DRAW_MS)), o: o * (1 - sw) });
  }));
  return live.map((m) => { const [x0, y0, x1, y1] = m.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = 1 + 0.9 * m.sw;
    return <g key={m.key} opacity={m.o} transform={m.sw ? `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})` : undefined}><Mark m={m} /></g>; });
}

// hand-drawn ring (D.marker `ring`): 2.12 turns from -0.6 pi, radius wobble 4%, drawn by progress p
const ringD = (cx, cy, rx, ry, p) => { const n = Math.floor(64 * c01(p)); if (n < 1) return null;
  return Array.from({ length: n + 1 }, (_, k) => { const a = -Math.PI * 0.6 + (k / 64) * Math.PI * 2.12, r = 1 + Math.sin(k * 0.9) * 0.04;
    return `${k ? 'L' : 'M'}${(cx + Math.cos(a) * rx * r).toFixed(1)},${(cy + Math.sin(a) * ry * r).toFixed(1)}`; }).join(''); };
const TONE = { warn: KR, confirm: KB };

function Mark({ m }) {
  const [x0, y0, x1, y1] = m.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, p = m.p, u = m.u, tone = TONE[m.tone];
  const line = (d, color = GOLD, w = 6, dash) => (
    <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" vectorEffect="non-scaling-stroke"
      strokeDasharray={dash ? undefined : '1 1'} strokeDashoffset={dash ? undefined : 1 - p} style={dash ? { strokeDasharray: dash } : undefined} />
  );
  const stroke = (d, color, w) => d && <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  // marker (D.marker): a toned mark is hand-drawn red (warn) or blue (confirm); its text sits left of it, a warn label is
  // underlined with the demo's wavy stroke. Text gets a white halo (the demo draws ink on paper; sources may be dark).
  if (tone && (m.kind === 'ring' || m.kind === 'check')) {
    // text left of the mark as in the demo, unless that runs off the chart (the demo's wick always had room on its left)
    const t = m.t, sz = (m.kind === 'ring' ? 40 : 34) * u, tw = m.text.length * sz * 0.56, left = x0 - 36 * u - tw >= 0;
    const lx = left ? x0 - 36 * u : x1 + 36 * u, ty = m.kind === 'ring' ? cy : cy - sz * 1.3; // confirm text sits above its check
    const d = m.kind === 'ring' ? ringD(cx, cy, Math.max(44 * u, (x1 - x0) / 2), Math.max(84 * u, (y1 - y0) / 2), io(c01(t / 800))) // demo ring 44x84 = the minimum
      : (() => { const q = c01(t / 500), s = Math.max(12 * u, (x1 - x0) / 2), P = [[cx - s, cy], [cx - s * 0.3, cy + s * 0.7], [cx + s, cy - s * 0.8]];
        if (!q) return null; const L = (A, B, f) => `${A[0] + (B[0] - A[0]) * f},${A[1] + (B[1] - A[1]) * f}`;
        return q < 0.4 ? `M${L(P[0], P[0], 0)} L${L(P[0], P[1], q / 0.4)}` : `M${L(P[0], P[0], 0)} L${L(P[1], P[1], 0)} L${L(P[1], P[2], (q - 0.4) / 0.6)}`; })();
    const ta = m.kind === 'ring' ? c01((t - 700) / 300) : c01((t - 300) / 300), up = io(c01((t - 1100) / 500)), ux = left ? lx - tw : lx;
    return <g>
      {stroke(d, tone, 10)}
      {m.text && ta > 0 && <SText x={lx} y={ty} size={sz} fill={m.kind === 'ring' ? KI : KB} anchor={left ? 'end' : 'start'} a={ta}>{m.text}</SText>}
      {m.text && m.kind === 'ring' && up > 0 && stroke(Array.from({ length: Math.floor(30 * up) + 1 }, (_, k) =>
        `${k ? 'L' : 'M'}${(ux + (k / 30) * tw).toFixed(1)},${(ty + sz * 0.8 + Math.sin(k * 0.8) * 3.2 * u).toFixed(1)}`).join(''), KR, 8)}
    </g>;
  }
  switch (m.kind) {
    case 'level': return line(`M${x0},${y0} L${x1},${y1}`);
    case 'underline': return tone ? stroke(Array.from({ length: Math.floor(30 * io(c01(m.t / 500))) + 1 }, (_, k) =>
      `${k ? 'L' : 'M'}${(x0 + (k / 30) * (x1 - x0)).toFixed(1)},${(y0 + Math.sin(k * 0.8) * 3.2 * u).toFixed(1)}`).join(''), tone, 8) : line(`M${x0},${y0} L${x1},${y1}`);
    case 'ring': { const rx = Math.max(8, (x1 - x0) / 2), ry = Math.max(8, (y1 - y0) / 2);
      return line(`M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0`); }
    case 'zone': return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={GOLD} fillOpacity={0.3 * p} stroke={GOLD} strokeWidth={4}
      vectorEffect="non-scaling-stroke" strokeOpacity={p} />;
    case 'cross': return <g>{line(`M${x0},${y0} L${x1},${y1}`, RED, 8)}{p > 0.5 && line(`M${x1},${y0} L${x0},${y1}`, RED, 8)}</g>;
    case 'check': return line(`M${x0},${cy} L${cx - 2},${y1} L${x1 + 4},${y0 - 6}`, GREEN, 8);
    case 'path': if (m.ghost) return <Ghost m={m} />; // falls through to the gold arrow path otherwise
    // eslint-disable-next-line no-fallthrough
    case 'arrow': {
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - Math.abs(y1 - y0) * 0.6 - 6, a = Math.atan2(y1 - my, x1 - mx), h = 6;
      return <g>{line(`M${x0},${y0} Q${mx},${my} ${x1},${y1}`, GOLD, 5)}
        {p > 0.95 && <path d={`M${x1},${y1} l${-h * Math.cos(a - 0.5)},${-h * Math.sin(a - 0.5)} M${x1},${y1} l${-h * Math.cos(a + 0.5)},${-h * Math.sin(a + 0.5)}`}
          stroke={GOLD} strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinecap="round" />}</g>;
    }
    case 'term': return <Term m={m} />;
    case 'label': {
      // label pops 0.7 -> 1 with overshoot
      const txt = m.text;
      const s = 0.7 + 0.3 * Easing.out(Easing.back(1.8))(p), fs = 10, w = m.text.length * fs * 0.6 + 12;
      const ty = m.below ? y1 + 8 : y0 - 8 - fs * 1.6;
      return <g transform={`translate(${cx} ${ty + fs * 0.8}) scale(${s})`}>
        <rect x={-w / 2} y={-fs * 0.8} width={w} height={fs * 1.6} rx={3} fill={NAVY} stroke={GOLD} strokeWidth={3} vectorEffect="non-scaling-stroke" />
        <text x={0} y={fs * 0.35} fontSize={fs} fontFamily={HEAD} fill="#fff" textAnchor="middle" letterSpacing={0.5}>{txt.toUpperCase()}</text>
      </g>;
    }
    default: return null;
  }
}

// ── Phase 7.2 drawing kit: the demo's chip / txt, in source px (u-scaled), and glyphs drawn as SVG ─────────
// (Railway's box has no symbol font: U+275A rendered as tofu in exec 68874, so arrows / triangles / checks are paths)
const SText = ({ x, y, size, fill = KI, anchor = 'start', a = 1, weight = 800, children }) => (
  <text x={x} y={y} fontSize={size} fontFamily={BODY} fontWeight={weight} fill={fill} textAnchor={anchor} dominantBaseline="central" opacity={c01(a)}
    stroke="#fff" strokeWidth={size * 0.22} strokeLinejoin="round" paintOrder="stroke">{children}</text>
);
function SChip({ x, y, size, text, bg = KI, fg = '#fff', align = 'left', a = 1, s = 1, check, caret }) {
  const pad = size * 0.55, tw = text.length * size * 0.62, extra = check ? size * 1.1 : caret ? size * 0.5 : 0, w = tw + extra + pad * 2, h = size + pad * 1.3;
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, ex = -w / 2 + pad + tw + size * 0.15;
  return a > 0 && <g opacity={c01(a)} transform={`translate(${x0 + w / 2} ${y}) scale(${s})`}>
    <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={size * 0.28} fill={bg} />
    <text x={-w / 2 + pad + tw / 2} y={size * 0.05} fontSize={size} fontFamily={BODY} fontWeight={800} fill={fg} textAnchor="middle" dominantBaseline="central">{text}</text>
    {check && <path d={`M${ex + size * 0.1},${0} L${ex + size * 0.4},${size * 0.3} L${ex + size * 0.95},${-size * 0.35}`} fill="none" stroke={fg} strokeWidth={size * 0.16} strokeLinecap="round" strokeLinejoin="round" />}
    {caret && <rect x={ex} y={-size * 0.5} width={size * 0.3} height={size} fill={fg} />}
  </g>;
}
const KChip = ({ bg = KI, fg = '#fff', size = 30, font = BODY, style, children }) => (
  <div style={{ position: 'absolute', background: bg, color: fg, fontFamily: font, fontWeight: 800, fontSize: size, lineHeight: 1, whiteSpace: 'nowrap',
    padding: `${size * 0.36}px ${size * 0.55}px`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: size * 0.3, ...style }}>{children}</div>
);
const Glyph = ({ k }) => (
  <svg width="0.9em" height="0.9em" viewBox="0 0 10 10" style={{ flex: 'none' }}>{{
    rew: <path d="M5 1L0.5 5L5 9ZM9.5 1L5 5L9.5 9Z" fill="currentColor" />,
    back: <path d="M3 1.8L0.8 4L3 6.2M1 4H6A2.7 2.7 0 0 1 6 9.4H4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
    to: <path d="M0.5 5H9M6 2L9 5L6 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
    up: <path d="M5 1.5L9.5 8.5H0.5Z" fill="currentColor" />,
    down: <path d="M5 8.5L9.5 1.5H0.5Z" fill="currentColor" />,
    check: <path d="M1 5.2L3.8 8L9 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  }[k]}</svg>
);

// term lock-in (D.term): leader pulls out of the point, the term types in (caret), locks red with a small pulse, meaning above.
// ponytail: the demo's soft typing tick is not played: no tick SFX asset exists yet (add when one is sourced).
function Term({ m }) {
  const u = m.u, t = m.t, [x0, y0, x1, y1] = m.box, tx = (x0 + x1) / 2, ty = (y0 + y1) / 2, sz = 40 * u, word = m.text.toUpperCase();
  const lp = io(c01(t / 500)), ex = tx + 200 * u * lp, tp = c01((t - 500) / 1400), cnt = Math.floor(word.length * tp), lock = c01((t - 1900) / 300);
  const caret = tp > 0 && tp < 1 && t % 500 < 250;
  return <g>
    {lp > 0 && <g>
      <line x1={tx} y1={ty} x2={ex} y2={ty} stroke="#fff" strokeWidth={8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1={tx} y1={ty} x2={ex} y2={ty} stroke={KI} strokeWidth={4} vectorEffect="non-scaling-stroke" />
      <circle cx={tx} cy={ty} r={8 * u} fill={KI} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" /></g>}
    {lp >= 1 && (cnt > 0 || caret) && <SChip x={ex + 12 * u} y={ty} size={sz} text={word.slice(0, cnt)} caret={caret} bg={lock > 0 ? KR : KI} s={1 + 0.08 * Math.sin(lock * Math.PI)} />}
    {m.meaning && <SText x={ex + 12 * u} y={ty - sz * 1.9} size={sz * 0.78} weight={600} fill={KG} a={c01((t - 2200) / 400)}>{m.meaning}</SText>}
  </g>;
}

// ghost path -> REALITY (D.ghost): a dotted blue path draws where price should go (1.7 s), EXPECTED PATH chip; when the play
// reaches the event, REALITY + check lands at the path's end and everything fades (render-props: reality_ms / hold_end)
function Ghost({ m }) {
  const u = m.u, t = m.t, [x0, y0, x2, y2] = m.box, qx = x0 + (x2 - x0) * 0.44, qy = y0 + (y2 - y0) * 0.04, dir = Math.sign(y2 - y0) || 1;
  const Q = (v) => [(1 - v) ** 2 * x0 + 2 * (1 - v) * v * qx + v * v * x2, (1 - v) ** 2 * y0 + 2 * (1 - v) * v * qy + v * v * y2];
  const n = Math.floor(40 * io(c01(t / 1700)));
  const d = Array.from({ length: n + 1 }, (_, k) => `${k ? 'L' : 'M'}${Q(k / 40).map((v) => v.toFixed(1)).join(',')}`).join('');
  const [ex, ey] = Q(0.33), ra = m.reality_ms != null ? c01((m.now - m.reality_ms) / 300) : 0;
  return <g>
    {n > 0 && <path d={d} fill="none" stroke={KB} strokeWidth={10 * u} strokeLinecap="round" strokeDasharray={`${4 * u} ${22 * u}`} />}
    <SChip x={ex} y={ey - dir * 40 * u} size={28 * u} bg={KB} align="center" text="EXPECTED PATH" a={c01((t - 1500) / 400) * (1 - c01((m.now - m.hold_end) / 400))} />
    <SChip x={x2} y={y2 + dir * 36 * u} size={28 * u} bg={KB} align="right" text="REALITY" check a={ra} />
  </g>;
}

// spotlight (D.spotlight): the chart outside the mark fades back (demo: candles to 18%), plus a soft vignette on the mark
function Spotlight({ box, src, k, u }) {
  const [x0, y0, x1, y1] = box, p = 16 * u, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return <g>
    <defs><radialGradient id="pg-spot" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={520 * u}>
      <stop offset={40 / 520} stopColor="rgb(18,24,34)" stopOpacity={0} /><stop offset={1} stopColor="rgb(18,24,34)" stopOpacity={0.12 * k} /></radialGradient></defs>
    <path fillRule="evenodd" fill={INK} fillOpacity={0.82 * k} d={`M0,0H${src.w}V${src.h}H0Z M${x0 - p},${y0 - p}H${x1 + p}V${y1 + p}H${x0 - p}Z`} />
    <rect width={src.w} height={src.h} fill="url(#pg-spot)" />
  </g>;
}

// live R counter (D.rr): loss box red, profit box blue, entry line ink, stop line red, R chip blue, climbing as candles print.
// Hide rule: gone (150 ms) while the source view moves, back (300 ms) at the re-measured position (render-props series).
function RCounter({ b, now, u }) {
  const r = b.rr, i = Math.max(0, r.series.findLastIndex((q) => q.at <= now)), p = r.series[i], prev = r.series[i - 1];
  const vis = !p.on ? 1 - c01((now - p.at) / 150) : prev && !prev.on ? c01((now - p.at) / 300) : c01((now - b.a - 300) / 500);
  if (vis <= 0) return null;
  const xL = r.x0 + p.dx, xR = r.x1 + p.dx, e = r.entry_y, sl = r.stop_y, hi = p.best_y, dir = sl > e ? 1 : -1, R = Math.abs(e - hi) / Math.abs(sl - e);
  return <g opacity={vis}>
    <rect x={xL} y={Math.min(e, sl)} width={xR - xL} height={Math.abs(sl - e)} fill="rgba(214,69,65,.14)" />
    <rect x={xL} y={Math.min(e, hi)} width={xR - xL} height={Math.abs(e - hi)} fill="rgba(0,128,255,.13)" />
    <rect x={xL} y={e - 2 * u} width={xR - xL} height={4 * u} fill={KI} />
    <rect x={xL} y={sl - 2 * u} width={xR - xL} height={4 * u} fill={KR} />
    <SChip x={xL + 12 * u} y={e + dir * 32 * u} size={26 * u} text="ENTRY" />
    <SChip x={xL + 12 * u} y={sl - dir * 32 * u} size={26 * u} bg={KR} text="STOP" />
    <SChip x={xR} y={hi - dir * 44 * u} size={56 * u} bg={KB} align="right" text={`+${R.toFixed(1)}R`} />
  </g>;
}

// pause & predict (D.predict): the chart greys out, "Which way next?" with UP / DOWN and a 2 s draining bar; the answer chip
// pops beside price as the next beat plays on (drawn in PGPresentation)
function Predict({ b, now, box }) {
  const o = c01((now - b.a) / 300) * (1 - c01((now - b.z + 300) / 300)); if (o <= 0) return null;
  const cw = 800, drain = 1 - c01((now - b.a - 300) / 2000);
  const C = (y, el) => <div style={{ position: 'absolute', left: 0, right: 0, top: y, display: 'flex', justifyContent: 'center', transform: 'translateY(-50%)' }}>{el}</div>;
  return <>
    <div style={{ position: 'absolute', ...box, background: `rgba(236,239,243,${(0.8 * o).toFixed(3)})` }} />
    <div style={{ position: 'absolute', left: W / 2 - cw / 2, top: 300, width: cw, height: 440, opacity: o, background: '#fff', border: `6px solid ${KI}`,
      borderRadius: 28, boxShadow: '0 16px 36px rgba(0,0,0,.3)', boxSizing: 'border-box' }}>
      {C(140,<div style={{ fontFamily: BODY, fontSize: 68, fontWeight: 800, color: KI }}>Which way next?</div>)}
      {[['up', KB, 'UP', -156], ['down', KBEAR, 'DOWN', 156]].map(([g, bg, t, dx]) =>
        <KChip key={g} bg={bg} size={42} style={{ left: cw / 2 + dx, top: 280, transform: 'translate(-50%,-50%)' }}><Glyph k={g} />{t}</KChip>)}
      <div style={{ position: 'absolute', left: cw / 2 - 300, top: 372, width: 600, height: 16, background: KGRID }}>
        <div style={{ width: `${drain * 100}%`, height: '100%', background: KB }} /></div>
    </div>
  </>;
}

// ── Phase 7.3 hooks, ported from context/design/phm_treatment_specs/{finished,trap,question,contrast}.js (demo px x2) ──────
// finished setup first (D.finished): after the beat's own marks (level, sweep ring), ENTRY pops beside the entry candle, the
// arrow draws to the best price, +R pops there (ENTRY 0-0.4 s, arrow 0.3-1.0 s, +R 1.0-1.3 s after `at`)
function Finished({ b, now, u }) {
  const F = b.finished, t = now - F.at, sz = 36 * u, up = F.long ? -1 : 1, [ex, ey] = F.entry, [tx, ty] = F.target;
  const p3 = c01(t / 400), pa = io(c01((t - 300) / 700)), p4 = c01((t - 1000) / 300);
  const ax = ex + 24 * u, ay = ey + up * 44 * u, hx = ax + (tx - ax) * pa, hy = ay + (ty - ay) * pa, ang = Math.atan2(ty - ay, tx - ax);
  const head = [[10, 0], [-26, -18], [-26, 18]].map(([x, y]) => `${hx + (x * Math.cos(ang) - y * Math.sin(ang)) * u},${hy + (x * Math.sin(ang) + y * Math.cos(ang)) * u}`);
  return <g>
    <SChip x={ex + 32 * u} y={ey} size={sz} bg={KB} text="ENTRY" a={p3} s={popS(p3)} />
    {pa > 0 && <g>
      <line x1={ax} y1={ay} x2={hx} y2={hy} stroke={KB} strokeWidth={10} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={`M${head.join('L')}Z`} fill={KB} /></g>}
    <SChip x={tx} y={ty + up * 52 * u} size={sz * 1.2} bg={KB} align="right" text={`+${F.r.toFixed(1)}R`} a={p4} s={popS(p4)} />
  </g>;
}

// trap springs (D.trap): STOPS x's sit past the level from 0.4 s; the springing candle takes them (60 ms apart, each grows 1.9x
// and fades in 350 ms); TRAPPED stamps down 300 ms later and stays to the end of the beat
function TrapStops({ b, now, u }) {
  const T = b.trap, t = now - b.a, show = c01((t - 400) / 400), s0 = Math.max(T.size, 14 * u);
  return <g>
    {T.stops.map(([x, y], k) => { const pp = c01((now - T.at - k * 60) / 350), a = show * (1 - pp), s = s0 * (1 + pp * 0.9);
      return a > 0 && <path key={k} d={`M${x - s},${y - s}L${x + s},${y + s}M${x + s},${y - s}L${x - s},${y + s}`} stroke={KR} strokeWidth={6}
        strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={a} />; })}
    <SChip x={T.stops[0][0] - 28 * u} y={T.stops[0][1]} size={26 * u} bg={KL} align="right" text="STOPS" a={c01((t - 500) / 400) * (1 - c01((now - T.at) / 300))} />
  </g>;
}
// the stamp scales with the chart (catalog "better": stays in proportion on narrow sources), rotated -0.12 rad, 1.8x -> 1x
function Stamp({ b, now, box }) {
  const sp = c01((now - b.trap.at - 300) / 400), a = sp * (1 - c01((now - b.z + 300) / 300)); if (a <= 0) return null;
  const z = (1.8 - 0.8 * out(sp)) * Math.max(0.5, Math.min(box.width, box.height * 1.2) / 1080);
  return <div style={{ position: 'absolute', left: box.left + box.width * 0.6, top: box.top + box.height * 0.28, opacity: a,
    transform: `translate(-50%, -50%) rotate(-0.12rad) scale(${z})`, border: `10px solid ${KR}`, color: KR, fontFamily: BODY, fontWeight: 800,
    fontSize: 108, lineHeight: 1, padding: '16px 30px', whiteSpace: 'nowrap' }}>TRAPPED</div>;
}

// freeze and ask (D.question): on the freeze the chart washes to paper except the key mark, a pin drops onto the wick tip
// (0.1-0.5 s), the question types out (0.5-2.5 s; string slicing, never per-letter opacity) in the side band when it is >= 500 px,
// else in a dark strip across the top of the chart
function QWash({ b, now, src, u }) {
  const fz = c01((now - b.a) / 300) * (1 - c01((now - b.z + 300) / 300)), m = b.marks[0], p = 16 * u; if (!m || fz <= 0) return null;
  const [x0, y0, x1, y1] = m.box;
  return <path fillRule="evenodd" fill="#fbfbf9" fillOpacity={0.74 * fz} d={`M0,0H${src.w}V${src.h}H0Z M${x0 - p},${y0 - p}H${x1 + p}V${y1 + p}H${x0 - p}Z`} />;
}
function QPin({ b, now, u }) {
  const pp = c01((now - b.a - 100) / 400); if (pp <= 0) return null;
  const [tx, ty] = b.question.pin, x = tx - 92 * u, y = ty - 220 * u + (204 * u) * out(pp);
  return <g opacity={pp}>
    <line x1={x + 24 * u} y1={y + 16 * u} x2={tx - 6 * u} y2={ty - 4 * u} stroke={KB} strokeWidth={4} vectorEffect="non-scaling-stroke" />
    <circle cx={x} cy={y} r={34 * u} fill={KB} />
    <text x={x} y={y + 2 * u} fontSize={44 * u} fontFamily={BODY} fontWeight={800} fill="#fff" textAnchor="middle" dominantBaseline="central">?</text>
  </g>;
}
function QText({ b, now, box, band }) {
  const words = b.question.text.split(' '), mid = b.question.text.length / 2;
  let cut = 0, run = 0; words.forEach((w, i) => { run += w.length + 1; if (Math.abs(run - mid) < Math.abs(cut - mid)) cut = run; });
  const L1 = b.question.text.slice(0, cut).trim(), L2 = b.question.text.slice(cut).trim();
  const tp = c01((now - b.a - 500) / 2000), ch = Math.floor((L1.length + L2.length) * tp), a = 1 - c01((now - b.z + 300) / 300);
  if (!ch || a <= 0) return null;
  const s1 = L1.slice(0, ch), s2 = L2.slice(0, Math.max(0, ch - L1.length));
  if (band >= 500) { // side band: wrap to its width (demo: ~0.5 em per char)
    const w = band - 56, sz = Math.min(60, w / 9), lines = []; let cur = '';
    [...s1.split(' '), ...s2.split(' ')].filter(Boolean).forEach((wd) => { if ((cur + ' ' + wd).length * sz * 0.5 > w && cur) { lines.push(cur); cur = wd; } else cur = cur ? `${cur} ${wd}` : wd; });
    lines.push(cur);
    return <div style={{ position: 'absolute', left: 20, top: 300, width: w + 16, height: sz * 5, background: 'rgba(7,16,26,.7)', opacity: a, padding: '12px 14px',
      boxSizing: 'border-box', fontFamily: BODY, fontWeight: 800, fontSize: sz, lineHeight: 1.15, color: '#fff' }}>{lines.map((l, i) => <div key={i}>{l}</div>)}</div>;
  }
  const T = (s, y) => <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', transform: 'translateY(-50%)', fontFamily: BODY,
    fontWeight: 800, fontSize: 60, color: '#fff', whiteSpace: 'nowrap' }}>{s}</div>;
  return <div style={{ position: 'absolute', left: 0, width: W, top: box.top + 20, height: 192, background: 'rgba(7,16,26,.72)', opacity: a }}>
    {T(s1, 56)}{T(s2, 136)}</div>;
}

// spot the real one (D.contrast): two REAL frames, each at its own true shape, "which one?" and a 3 s countdown, then the
// verdict borders + labels. Layout sits higher than the demo's (verdict row y 770, not 960) so the always-on captions never
// cover it; the countdown gets a white disc (the demo drew ink digits on the dark ground: unreadable).
function Contrast({ b, now, video, src, f }) {
  const C = b.contrast, t = now - b.a, o = c01(t / 300) * (1 - c01((now - b.z + 300) / 300)), rev = c01((t - 4000) / 400);
  if (o <= 0) return null;
  const fit = (cx, s) => { let h = 580, w = (h * s.w) / s.h; if (w > 880) { w = 880; h = (w * s.h) / s.w; } return { left: cx - w / 2, top: 130 + (580 - h) / 2, width: w, height: h }; };
  const cp = c01((t - 800) / 3100), R = 52, arc = 2 * Math.PI * R;
  return <AbsoluteFill style={{ background: '#1b212c', opacity: o }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 72, textAlign: 'center', transform: 'translateY(-50%)', fontFamily: BODY, fontWeight: 800, fontSize: 52, color: '#fff' }}>{C.question}</div>
    {[['a', W * 0.26, video, b.from_ms, src], ['b', W * 0.74, C.video, C.from_ms, C.src]].map(([id, cx, v, ms, s], i) => {
      const bx = fit(cx, s), good = C.real === id;
      return <React.Fragment key={id}>
        <div style={{ position: 'absolute', ...bx, overflow: 'hidden', boxShadow: `0 0 0 ${rev > 0 ? 12 : 4}px ${rev > 0 ? (good ? KB : KL) : '#46505e'}` }}>
          <Freeze frame={0}><Clip src={v} from={f(ms)} /></Freeze></div>
        <KChip size={44} style={{ left: bx.left + 24, top: bx.top + 48, transform: 'translateY(-50%)' }}>{id.toUpperCase()}</KChip>
        <KChip bg={good ? KB : '#5a6472'} size={32} style={{ left: cx, top: 770, opacity: rev, transform: 'translate(-50%, -50%)' }}>{C.labels[i]}{good && <Glyph k="check" />}</KChip>
      </React.Fragment>;
    })}
    {rev < 1 && <svg width={2 * R + 24} height={2 * R + 24} style={{ position: 'absolute', left: W / 2 - R - 12, top: 770 - R - 12, opacity: 1 - rev }}>
      <circle cx={R + 12} cy={R + 12} r={R} fill="#fff" stroke={KGRID} strokeWidth={12} />
      <circle cx={R + 12} cy={R + 12} r={R} fill="none" stroke={KB} strokeWidth={12} strokeDasharray={`${arc * (1 - cp)} ${arc}`} transform={`rotate(-90 ${R + 12} ${R + 12})`} />
      <text x={R + 12} y={R + 14} fontSize={R * 0.95} fontFamily={BODY} fontWeight={800} fill={KI} textAnchor="middle" dominantBaseline="central">{Math.max(1, Math.ceil(3 * (1 - cp)))}</text>
    </svg>}
  </AbsoluteFill>;
}

// ── seams (Cut Sheet D1-D4, design v2 demos): [out ms, in ms]. Lengths = catalog (curve 0.4-0.6 s, waterfall 0.6-0.9 s,
// zoom / inverse 0.6 s); the out:in split and every curve are the demo's (CUT vs settle time). The two cards are never
// on screen together: the old one finishes by b.z, the new one starts at b.a.
const SEAM = { 's-curve': [280, 220], 's-waterfall': [350, 400], 's-zoom': [290, 310], 's-inverse': [290, 310] };
const inC = Easing.in(Easing.cubic);
// whole-card half of a seam: side 'out' (p 0->1 = leaving) or 'in' (p 0->1 = settling)
function seamFx(seam, side, p) {
  if (side === 'out') { const q = inC(p);
    if (seam === 's-curve') return { o: 1 - c01(p / 0.62), tf: `translateX(${-320 * q}px)` };
    if (seam === 's-zoom') return { o: 1 - 0.85 * q, tf: `scale(${1 + 0.55 * q})`, blur: 9 * q };
    if (seam === 's-inverse') return { o: 1 - 0.85 * q, tf: `scale(${1 - 0.22 * q})`, blur: 9 * q };
    return { o: 1, tf: '' }; // s-waterfall: per word
  }
  const q = out(p);
  if (seam === 's-curve') return { o: c01(0.35 + 0.65 * q), tf: `translateX(${320 * (1 - q)}px)` };
  if (seam === 's-zoom') return { o: c01(0.15 + 0.85 * q), tf: `scale(${0.72 + 0.28 * q})`, blur: 9 * (1 - q) };
  if (seam === 's-inverse') return { o: c01(0.15 + 0.85 * q), tf: `scale(${1.3 - 0.3 * q})`, blur: 9 * (1 - q) };
  return { o: 1, tf: '' };
}
// waterfall per word (demo x0.4): out = each word rips left on its own later ramp; in = cascade with shrinking gaps
function waterfall(side, t, i, n) {
  if (side === 'out') { const s = i * Math.min(22, 100 / Math.max(1, n - 1)), p = inC(c01((t - s) / 250));
    return { dx: -300 * p, a: 1 - c01((t - s) / 145) }; }
  let s = 0; for (let k = 0; k < i; k++) s += 56 * 0.84 ** k;
  const p = out(c01((t - s) / 200)); return { dx: 300 * (1 - p), a: c01(0.35 + 0.65 * p) };
}

// ── cards: parts appear on their spoken word; a highlight turns the said word gold ─
function Card({ b, now, box, seamOut }) {
  const g = b.graphic, seamIn = g.seam, [, IN] = SEAM[seamIn] || [], [OUT] = SEAM[seamOut] || [];
  if ((seamIn && now < b.a) || (seamOut && now >= b.z)) return null;
  let e = 1, tf = '', blur = 0, wf = null;
  if (seamIn && now < b.a + IN) { const x = seamFx(seamIn, 'in', c01((now - b.a) / IN)); e = x.o; tf = x.tf; blur = x.blur || 0;
    if (seamIn === 's-waterfall') wf = { side: 'in', t: now - b.a }; }
  else if (!seamIn) { const x = out(c01((now - b.a + 400) / 400)); e = x; tf = `translateX(${(1 - x) * 40}px)`; }
  if (seamOut && now >= b.z - OUT) { const x = seamFx(seamOut, 'out', c01((now - b.z + OUT) / OUT)); e *= x.o; tf += ' ' + x.tf; blur += x.blur || 0;
    if (seamOut === 's-waterfall') wf = { side: 'out', t: now - b.z + OUT }; }
  else if (!seamOut) e *= 1 - c01((now - b.z) / 300);
  const shownAt = (i) => g.steps.find((s) => s.kind === 'part' && s.part === i)?.at_ms ?? b.a;
  const hot = (i) => g.steps.filter((s) => s.kind === 'highlight' && s.part === i && now >= s.at_ms);
  // global word index across parts, for the waterfall ramps
  const first = g.parts.reduce((acc, s, i) => [...acc, acc[i] + s.split(/\s+/).filter(Boolean).length], [0]), nWords = first.at(-1);
  const Part = ({ i, size, font = BODY, weight = 700 }) => {
    const pe = out(c01((now - shownAt(i)) / 300)), hs = hot(i); let wi = first[i], li = 0;
    return (
      <div style={{ opacity: pe, transform: `translateY(${(1 - pe) * 24}px)`, fontFamily: font, fontSize: size, fontWeight: weight, lineHeight: 1.15, color: '#fff' }}>
        {g.parts[i].split(/(\s+)/).map((w, j) => {
          if (!w.trim()) return <span key={j}>{w}</span>;
          // a part lands whole (words 60 ms apart from the part's cue): waiting for each word to be SAID left half-cards on screen
          const at = shownAt(i) + 60 * li++, reveal = out(c01((now - at) / 260)), wordIndex = wi++;
          const h = hs.find((s) => norm(w) && (norm(w).startsWith(norm(s.word)) || norm(s.word).startsWith(norm(w))));
          const pop = h ? 1 + 0.12 * Math.max(0, 1 - (now - h.at_ms) / 300) : 1;
          const f = wf ? waterfall(wf.side, wf.t, wordIndex, nWords) : null;
          const st = { ...(h ? { color: GOLD, textShadow: `0 0 18px ${GOLD}88` } : {}),
            display: 'inline-block', opacity: reveal * (f ? f.a : 1),
            transform: `${f ? `translateX(${f.dx}px) ` : ''}translateY(${(1 - reveal) * 18}px) scale(${pop})` };
          return <span key={j} style={st}>{w}</span>;
        })}
      </div>
    );
  };
  const n = g.parts.length;
  let body;
  if (g.treatment === 'p-title') body = <><Part i={0} size={64} font={HEAD} weight={600} />
    <div style={{ height: 8, marginTop: 18, background: GOLD, width: `${out(c01((now - b.a) / 600)) * 100}%` }} /></>;
  else if (g.treatment === 'p-compare') body = <div style={{ display: 'flex', gap: 20 }}>{g.parts.slice(0, 2).map((s, i, P) =>
    <div key={i} style={{ flex: 1, borderTop: `8px solid ${i ? GREEN : RED}`, paddingTop: 20 }}><Part i={i} size={Math.min(...P.map((x) => fitSize(x, (box.w - 90) / 2, 34, 22, 4)))} /></div>)}</div>;
  else body = g.parts.map((_, i) => <React.Fragment key={i}>
    {i > 0 && g.treatment === 'p-diagram' && <div style={{ color: GOLD, fontSize: 40, lineHeight: 1, margin: '8px 0', opacity: out(c01((now - shownAt(i)) / 300)) }}>↓</div>}
    <div style={{ marginTop: i && g.treatment !== 'p-diagram' ? 22 : 0 }}><Part i={i} size={Math.min(...g.parts.map((x) => fitSize(x, box.w - 70, n > 2 ? 36 : 40, 22, 3)))} /></div>
  </React.Fragment>);
  return (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, display: 'flex', alignItems: 'center', opacity: e,
      transform: tf || undefined, filter: blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : undefined }}>
      <div style={{ width: '100%', background: `${NAVY}F0`, borderLeft: `10px solid ${GOLD}`, borderRadius: 18, padding: '32px 30px',
        boxShadow: '0 20px 50px rgba(0,0,0,.35)' }}>{body}</div>
    </div>
  );
}

// ── Phase 7.5 Cut Sheet, ported from context/design/phm_treatment_specs/{a-chapter,p-*,a-loop}.js. Text uses
// render-props' real word times (m-words); metrics count and fill together (m-countup). No CSS animation: every value is frame-derived.
const KNAVY = '#1c3560', KGOLD = '#e6b76c', KPANEL = 'rgba(9,24,42,.93)';

// The text lands whole from its first word's cue (words 70 ms apart). Owner pt70: word-by-word on the SPOKEN word left fragments
// ("RAID THE", "ORDER", "LOCATE") whenever the narration said it differently or the card left first.
function WordReveal({ text, steps, now, size, color = KNAVY, align = 'center', weight = 800, font = BODY, highlight = -1, style }) {
  let k = 0; const t0 = Math.min(Infinity, ...(steps || []).map((s) => s?.at_ms).filter(Number.isFinite)), start = t0 === Infinity ? -Infinity : t0;
  return <div style={{ fontFamily: font, fontSize: size, fontWeight: weight, lineHeight: 1.12, color, textAlign: align, ...style }}>
    {String(text).split(/(\s+)/).map((w, i) => { if (!w.trim()) return <span key={i}>{w}</span>;
      const p = out(c01((now - start - 70 * k) / 340)), hi = k++ === highlight;
      return <span key={i} style={{ display: 'inline-block', opacity: p, color: hi ? GOLD : undefined,
        transform: `translateY(${(1 - p) * size * 0.28}px)` }}>{w}</span>; })}
  </div>;
}
const allWordSteps = (b) => b.graphic.word_steps?.flat() || [];
const CUT_TONE = { neutral: [KNAVY, '#F2F5FA'], warn: ['#C0432F', '#FAE9E4'], confirm: ['#1B8A6B', '#E2F2EA'], tease: [GOLD, '#F6EEDA'] };

// section card: kicker + title land together in the first 0.7 s, hold, then leave; the whole card always reads before it goes
// (was: title words waited for narration and the card left at 1.5 s, so titles vanished half-written)
function ChapterCut({ b, now }) {
  const t = now - b.a, D = Math.min(CHAPTER_MS, b.z - b.a), enter = out(seg(t, 0, 450)), leave = io(seg(t, D - 450, D)); if (t >= D) return null;
  const [kicker, name] = b.graphic.parts, go = [{ at_ms: b.a + 150 }], size = fitSize(name, 1500, 112, 56, 2);
  return <AbsoluteFill style={{ background: '#F6F7F4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    opacity: enter * (1 - leave), transform: `scale(${1 + 0.12 * leave})` }}>
    {kicker && <div style={{ fontFamily: BODY, fontSize: 34, fontWeight: 800, letterSpacing: 6, color: GOLD, opacity: out(seg(t, 100, 450)) }}>{kicker.toUpperCase()}</div>}
    <WordReveal text={name.toUpperCase()} steps={go} now={now} size={size} color={KNAVY} font={HEAD} weight={700} style={{ marginTop: 24, maxWidth: 1560 }} />
    <div style={{ width: 520 * out(seg(t, 500, 1100)), height: 8, background: GOLD, marginTop: 48 }} />
  </AbsoluteFill>;
}

function TitleCut({ b, now }) {
  const t = now - b.a, o = out(seg(t, 200, 650)) * (1 - seg(now, b.z - 400, b.z)), text = b.graphic.parts.join(' ');
  return <AbsoluteFill style={{ background: `rgba(255,255,255,${(0.72 * o).toFixed(3)})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: o }}>
    {b.graphic.kicker && <Label col={GOLD}>{b.graphic.kicker.toUpperCase()}</Label>}
    <WordReveal text={text} steps={allWordSteps(b)} now={now} size={112} color={KNAVY} font={BODY} weight={800} highlight={b.graphic.highlight ?? -1}
      style={{ maxWidth: 1600, marginTop: b.graphic.kicker ? 28 : 0 }} />
    <div style={{ width: 640 * out(seg(t, 900, 1600)), height: 9, background: GOLD, marginTop: 48 }} />
  </AbsoluteFill>;
}

function StatementCut({ b, now, box }) {
  const t = now - b.a, p = out(seg(t, 200, 650)) * (1 - seg(now, b.z - 350, b.z)), [col, bg] = CUT_TONE[b.graphic.tone] || CUT_TONE.neutral;
  const w = box.w, text = b.graphic.parts.join(' ');
  return <div style={{ position: 'absolute', left: box.x, top: box.y, width: w, height: box.h, display: 'flex', alignItems: 'center', opacity: p, transform: `translateY(${(1 - p) * 26}px)` }}>
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '48px 44px', background: bg, border: `4px solid ${col}`, borderLeftWidth: 14, borderRadius: 16, boxShadow: '0 18px 44px rgba(0,0,0,.28)' }}>
      <WordReveal text={text} steps={allWordSteps(b)} now={now} size={fitSize(text, w - 116, 56, 30, 5)} color={KI} align="left" />
    </div>
  </div>;
}

function ListCut({ b, now, box }) {
  const g = b.graphic, fs = Math.min(...g.parts.map((s) => fitSize(s, box.w - 96 - 98, 42, 26, 2))), o = seg(now, b.a, b.a + 300) * (1 - seg(now, b.z - 300, b.z));
  return <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, display: 'flex', alignItems: 'center', opacity: o }}>
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '48px 48px', background: '#f7f8f4', borderLeft: `8px solid ${GOLD}`, borderRadius: 16,
      boxShadow: '0 18px 44px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column', gap: 30 }}>
      {g.parts.map((s, i) => { const at = partAt(b, i), p = out(seg(now, at, at + 400));
        return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: p, transform: `translateY(${(1 - p) * 22}px)` }}>
          {g.mode === 'steps' ? <div style={{ flex: 'none', width: 70, height: 70, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: KNAVY,
            color: GOLD, fontFamily: BODY, fontSize: 34, fontWeight: 800 }}>{i + 1}</div> : g.mode === 'checks' ? <CheckSvg size={28} col="#1B8A6B" w={8} p={p} />
            : <div style={{ flex: 'none', width: 34, height: 18, background: GOLD }} />}
          <WordReveal text={s} steps={[{ at_ms: at }]} now={now} size={fs} color={KI} align="left" />
        </div>; })}
    </div>
  </div>;
}

function MetricCut({ b, now }) {
  const g = b.graphic, M = g.metrics, n = M.length, gap = 32, w = Math.min(480, (W - 160 - gap * (n - 1)) / n), row = n * w + (n - 1) * gap;
  return <AbsoluteFill style={{ background: 'rgba(255,255,255,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    {M.map((m, i) => { const at = partAt(b, Math.min(i, g.parts.length - 1)), p = out(seg(now, at, at + 1600)), shown = m.value * p;
      const val = `${m.prefix || ''}${shown.toFixed(m.decimals || 0)}${m.suffix || ''}`, x = (W - row) / 2 + i * (w + gap);
      return <div key={i} style={{ position: 'absolute', left: x, top: 320, width: w, height: 440, boxSizing: 'border-box', padding: '68px 50px', background: '#fff',
        border: `4px solid ${i ? KNAVY : GOLD}`, borderLeftWidth: 12, borderRadius: 12, opacity: p, transform: `translateY(${(1 - p) * 26}px)`, boxShadow: '0 18px 44px rgba(0,0,0,.22)' }}>
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 98, textAlign: 'center', color: KNAVY }}>{val}</div>
        <WordReveal text={m.label} steps={g.word_steps?.[i]} now={now} size={32} color={KL} style={{ marginTop: 34 }} />
        <div style={{ height: 18, background: '#DFE4EC', marginTop: 54, borderRadius: 9, overflow: 'hidden' }}><div style={{ width: `${100 * (m.bar ?? 1) * p}%`, height: '100%', background: i ? KNAVY : GOLD }} /></div>
      </div>; })}
  </AbsoluteFill>;
}

function DiagramCut({ b, now }) {
  const g = b.graphic, n = g.parts.length, topN = Math.min(3, n), pos = g.parts.map((_, i) => i < topN
    ? [320 + (i * 1280) / Math.max(1, topN - 1), 330] : [640 + ((i - topN) * 640) / Math.max(1, n - topN - 1), 720]);
  return <AbsoluteFill style={{ background: 'rgba(255,255,255,.88)' }}>
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>{pos.slice(1).map((p, i) => { const at = partAt(b, i + 1), q = out(seg(now, at - 450, at));
      return <line key={i} x1={pos[i][0]} y1={pos[i][1]} x2={pos[i + 1][0]} y2={pos[i + 1][1]} stroke="#9FB0C6" strokeWidth={7} strokeDasharray="1 1" pathLength={1} strokeDashoffset={1 - q} />; })}</svg>
    {g.parts.map((s, i) => { const at = partAt(b, i), p = out(seg(now, at, at + 450)); return <div key={i} style={{ position: 'absolute', left: pos[i][0] - 210, top: pos[i][1] - 80,
      width: 420, height: 160, boxSizing: 'border-box', padding: '20px 28px', background: '#fff', border: `4px solid ${i === n - 1 ? GOLD : KNAVY}`, borderLeftWidth: 12,
      borderRadius: 12, opacity: p, transform: `translateY(${(1 - p) * 26}px)`, boxShadow: '0 14px 34px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <WordReveal text={s} steps={[{ at_ms: at }]} now={now} size={fitSize(s, 420 - 72, 40, 24, 2)} color={i === n - 1 ? '#9A7424' : KNAVY} />
    </div>; })}
  </AbsoluteFill>;
}

function CrowdCut({ b, now, toScreen }) {
  const pin = b.graphic.pin && toScreen(b.graphic.pin); if (!pin) return null;
  const t = now - b.a, enter = out(seg(t, 300, 1100)), flush = out(seg(now, b.graphic.flush_at, b.graphic.flush_at + 500));
  const cx = Math.max(330, Math.min(W - 330, pin[0])), y = Math.max(250, Math.min(H - 360, pin[1] - 110));
  return <div style={{ position: 'absolute', left: cx - 270, top: y - 120, width: 540, height: 220 }}>
    {Array.from({ length: 14 }, (_, i) => { const p = out(seg(t, 300 + i * 60, 900 + i * 60)) * (1 - flush), x = 28 + (i % 7) * 76, yy = 74 + Math.floor(i / 7) * 76;
      return <div key={i} style={{ position: 'absolute', left: x, top: yy - flush * 90, width: 34, height: 54, opacity: p * enter }}>
        <div style={{ width: 26, height: 26, margin: '0 auto', borderRadius: '50%', background: flush > .3 ? '#C0432F' : KNAVY }} />
        <div style={{ width: 30, height: 24, margin: '4px auto 0', background: flush > .3 ? '#C0432F' : KNAVY }} /></div>; })}
    <KChip bg={flush > .3 ? '#C0432F' : KNAVY} size={30} style={{ left: 270, top: 0, opacity: enter, transform: 'translateX(-50%)' }}>{flush > .3 ? 'HUNTED' : b.graphic.parts[0].toUpperCase()}</KChip>
  </div>;
}

function ChapterRecapCut({ b, now, video, src, f }) {
  const g = b.graphic, n = g.parts.length, gap = 30, w = Math.min(390, (W - 180 - gap * (n - 1)) / n), row = n * w + (n - 1) * gap, h = 330;
  return <AbsoluteFill style={{ background: 'rgba(255,255,255,.88)' }}>
    <WordReveal text={g.title || 'WHERE WE HAVE BEEN'} steps={[]} now={now} size={52} color={KNAVY} style={{ position: 'absolute', top: 150, left: 0, right: 0 }} />
    {g.parts.map((label, i) => { const at = partAt(b, i), p = out(seg(now, at, at + 600)), x = (W - row) / 2 + i * (w + gap), vh = 220, vw = (vh * src.w) / src.h;
      return <div key={i} style={{ position: 'absolute', left: x, top: 330, width: w, height: h, background: '#fff', border: `3px solid ${i === n - 1 ? GOLD : KNAVY}`,
        borderRadius: 12, opacity: p, transform: `translateX(${(1 - p) * -180}px)`, boxShadow: '0 16px 36px rgba(0,0,0,.2)' }}>
        <div style={{ position: 'absolute', left: (w - Math.min(vw, w - 28)) / 2, top: 16, width: Math.min(vw, w - 28), height: vh, overflow: 'hidden' }}>
          <Freeze frame={0}><Clip src={video} from={f(g.frames[i])} /></Freeze></div>
        <WordReveal text={`${i + 1} · ${label}`} steps={g.word_steps?.[i]} now={now} size={28} color={i === n - 1 ? GOLD : KNAVY} style={{ position: 'absolute', left: 16, right: 16, bottom: 34 }} />
      </div>; })}
  </AbsoluteFill>;
}

// end card (Owner pt70): engagement, never a made-up "watch next". parts = [the comment question, the engagement line,
// the subscribe / notification line], all restating the outro narration. Comment bubble first, then the subscribe button
// is pressed (turns SUBSCRIBED) and the bell rings.
// pt70c: follows the voice. Nothing while the Mastermind CTA is spoken (the product pop-up owns that); the bubble lands on the
// spoken question, the subscribe row with the next sentence, and the button is pressed on the word "subscribe".
function EndCardCut({ b, now, captions }) {
  const g = b.graphic, [ask, line2, line3] = g.parts, said = (captions || []).filter((w) => w.a >= b.a && w.a < b.z);
  const qi = said.findIndex((w) => /\?["')]*$/.test(w.w)); let qs = qi;
  while (qs > 0 && !/[.!?]["')]*$/.test(said[qs - 1].w)) qs--;
  const q0 = qi >= 0 ? said[qs].a : b.a, q1 = said[qi + 1]?.a ?? q0 + 700;
  const sub = said.find((w) => w.a > q0 && /^subscrib/i.test(w.w))?.a ?? q1 + 1500, t = now - q0, ts = now - sub;
  if (t < 0) return null;
  const p1 = out(seg(t, 0, 550)), p2 = out(seg(now, q1, q1 + 550)), p3 = out(seg(now, Math.min(q1 + 300, sub - 600), sub)), press = seg(ts, 150, 350), done = ts >= 300;
  const ring = ts > 550 && ts < 1750 ? Math.sin((ts - 550) / 1000 * Math.PI * 8) * 16 * (1 - seg(ts, 550, 1750)) : 0;
  const Bell = () => <svg width={54} height={54} viewBox="0 0 24 24" style={{ transform: `rotate(${ring}deg)`, transformOrigin: '50% 10%' }}>
    <path d="M12 2a1.5 1.5 0 0 1 1.5 1.5v.6A6.5 6.5 0 0 1 18.5 10.5v4l2 3v1h-17v-1l2-3v-4A6.5 6.5 0 0 1 10.5 4.1v-.6A1.5 1.5 0 0 1 12 2Zm-2.3 18h4.6a2.3 2.3 0 0 1-4.6 0Z" fill={KNAVY} /></svg>;
  return <AbsoluteFill style={{ background: '#F6F7F4', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 120, opacity: out(seg(t, 0, 300)) }}>
    <div style={{ position: 'relative', width: 1400, boxSizing: 'border-box', padding: '46px 64px', background: '#fff', border: `5px solid ${KNAVY}`, borderRadius: 32,
      boxShadow: '0 18px 44px rgba(0,0,0,.16)', opacity: p1, transform: `translateY(${(1 - p1) * 30}px)`, display: 'flex', alignItems: 'center', gap: 40 }}>
      <svg width={96} height={96} viewBox="0 0 24 24" style={{ flex: 'none' }}><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill={GOLD} />
        <circle cx="8" cy="11" r="1.4" fill="#fff" /><circle cx="12" cy="11" r="1.4" fill="#fff" /><circle cx="16" cy="11" r="1.4" fill="#fff" /></svg>
      <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: fitSize(ask, 1400 - 128 - 136, 64, 36, 3), lineHeight: 1.18, color: KNAVY }}>{ask}</div>
      <div style={{ position: 'absolute', left: 120, bottom: -34, width: 56, height: 56, background: '#fff', borderRight: `5px solid ${KNAVY}`, borderBottom: `5px solid ${KNAVY}`, transform: 'rotate(45deg)' }} />
    </div>
    {line2 && <div style={{ width: 1400, marginTop: 74, fontFamily: BODY, fontWeight: 700, fontSize: fitSize(line2, 1400, 44, 28, 2), lineHeight: 1.25, color: '#26344a', textAlign: 'center', opacity: p2 }}>{line2}</div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 50, opacity: p3, transform: `translateY(${(1 - p3) * 24}px)` }}>
      <div style={{ padding: '26px 56px', borderRadius: 60, background: done ? '#E3E6EA' : '#CC0000', color: done ? '#3b4656' : '#fff', fontFamily: BODY, fontWeight: 800,
        fontSize: 44, letterSpacing: 2, transform: `scale(${1 - 0.08 * Math.sin(press * Math.PI)})`, boxShadow: '0 12px 28px rgba(0,0,0,.18)' }}>{done ? 'SUBSCRIBED' : 'SUBSCRIBE'}</div>
      <div style={{ width: 104, height: 104, borderRadius: '50%', background: '#fff', border: `4px solid ${KNAVY}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Bell /></div>
      {line3 && <div style={{ maxWidth: 640, fontFamily: BODY, fontWeight: 700, fontSize: fitSize(line3, 640, 36, 24, 2), lineHeight: 1.25, color: '#26344a' }}>{line3}</div>}
    </div>
  </AbsoluteFill>;
}

function LoopCut({ b, now }) {
  const p = out(seg(now, b.a + 400, b.a + 1200)) * (1 - seg(now, b.z - 350, b.z));
  return <AbsoluteFill style={{ background: `rgba(255,255,255,${(0.78 * p).toFixed(3)})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 1320, minHeight: 320, padding: '54px 60px', boxSizing: 'border-box', background: '#F6EEDA', border: `4px solid ${GOLD}`, borderLeftWidth: 14,
      borderRadius: 16, opacity: p, transform: `translateY(${(1 - p) * 26}px)`, boxShadow: '0 18px 44px rgba(0,0,0,.25)' }}>
      <Label col={GOLD}>COMING UP</Label>
      <WordReveal text={b.graphic.parts.join(' ')} steps={allWordSteps(b)} now={now} size={58} color={KI} align="left" style={{ marginTop: 38 }} />
    </div>
  </AbsoluteFill>;
}

// ── Phase 7.4 presentation, ported from context/design/phm_treatment_specs/<id>.js (demo px x2, demo kit colours K*, times
// from the beat start like the demos; every card leaves over the beat's last 400-500 ms). Deviations, all for the captions
// (always on, bottom): mistake + tease sit top-left under the chapter chip (demo: bottom-left), the astronaut aside sits
// mid-right (demo: bottom-right), the stack grows up from y 780 (demo: from H-100). Font = Inter (the demo's Schibsted is not loaded).
const seg = (t, a, b) => c01((t - a) / (b - a));
const popA = (p) => 0.6 + 0.4 * (OVERSHOOT ? back(c01(p)) : out(c01(p))); // D.astro word pop (follows the C1 switch)
// the demo's arrow(): a straight line drawn to progress p with a solid head at its tip, in screen px
function ScreenArrow({ x1, y1, x2, y2, p, col, w = 8, dash }) {
  if (p <= 0) return null;
  const x = x1 + (x2 - x1) * p, y = y1 + (y2 - y1) * p, a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return <svg style={{ position: 'absolute', inset: 0, width: W, height: H, overflow: 'visible' }}>
    <path d={`M${x1},${y1} L${x},${y}`} stroke={col} strokeWidth={w} strokeLinecap="round" strokeDasharray={dash} fill="none" />
    <path d="M10,0 L-26,-18 L-26,18 Z" fill={col} transform={`translate(${x} ${y}) rotate(${a})`} />
  </svg>;
}
// card kicker (prototype eyebrow: bold, tracked caps); was the mono font, which read as a debug label
const Label = ({ col, children, style }) => <div style={{ fontFamily: BODY, fontSize: 24, fontWeight: 800, letterSpacing: 4, color: col, ...style }}>{children}</div>;
const CheckSvg = ({ size, col, w, p = 1 }) => (
  <svg width={size * 2.4} height={size * 2.4} viewBox="-12 -12 24 24" style={{ flex: 'none', overflow: 'visible' }}>
    <path d="M-10,0 L-3,7 L10,-8" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} fill="none" stroke={col} strokeWidth={w * 10 / size}
      strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const partAt = (b, i) => b.graphic.steps?.find((s) => s.kind === 'part' && s.part === i)?.at_ms ?? b.a;

// definition (D.definition): a light term card in the panel, a dashed navy leader from its side to mark 0 (when there is one)
function Definition({ b, now, box, toScreen }) {
  const t = now - b.a, p = out(seg(t, 300, 800)) * (1 - io(seg(now, b.z - 400, b.z))); if (p <= 0) return null;
  const [term, ...meaning] = b.graphic.parts, x = box.x + (1 - p) * 80, w = box.w, inner = w - 88;
  const ts = fitSize(term, inner, 84, 36, 2), ms = Math.min(...meaning.map((s) => fitSize(s, inner - 30, 36, 24, 3)), 36);
  const y = box.y + box.h / 2 - 250, pin = b.graphic.pin && toScreen(b.graphic.pin);
  return <>
    {pin && <div style={{ opacity: p }}><ScreenArrow x1={x} y1={y + 250} x2={pin[0] + 12} y2={pin[1]} p={io(seg(t, 800, 1400))} col={KNAVY} w={5} dash="10 10" /></div>}
    <div style={{ position: 'absolute', left: x, top: box.y, width: w, height: box.h, display: 'flex', alignItems: 'center', opacity: p }}>
      <div style={{ width: '100%', boxSizing: 'border-box', padding: '44px 44px 40px', background: '#eff0eb', borderRadius: 20, boxShadow: '0 16px 36px rgba(0,0,0,.3)' }}>
        <Label col="#52728f">NEW TERM</Label>
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: ts, color: KNAVY, marginTop: 18, lineHeight: 1.08 }}>{term}</div>
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>{meaning.map((s, i) =>
          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'baseline', fontFamily: BODY, fontWeight: 700, fontSize: ms, color: '#26344a', lineHeight: 1.3 }}>
            <span style={{ flex: 'none', width: 14, height: 14, borderRadius: 3, background: GOLD, transform: 'translateY(-2px)' }} />{s}</div>)}</div>
        <div style={{ width: 128, height: 8, background: KNAVY, marginTop: 32 }} />
      </div>
    </div>
  </>;
}

// step spine (D.spine): dark panel, numbered steps on a line; step k lights (cyan) when mark k draws (render-props times it)
function Spine({ b, now, box }) {
  const o = seg(now, b.a + 300, b.a + 700) * (1 - seg(now, b.z - 500, b.z - 100)); if (o <= 0) return null;
  const P = b.graphic.parts, n = P.length, gap = Math.min(220, (box.h - 180) / n), fs = Math.min(40, box.w / 13);
  return <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, opacity: o, background: KPANEL, borderLeft: `6px solid ${KCY}` }}>
    <Label col={KCY} style={{ position: 'absolute', left: 38, top: 50 }}>{(b.graphic.title ? `${b.graphic.title} · ` : '').toUpperCase()}{n} STEPS</Label>
    <div style={{ position: 'absolute', left: 72, top: 160, width: 4, height: gap * (n - 1), background: 'rgba(137,199,215,.45)' }} />
    {P.map((s, i) => { const at = partAt(b, i), on = now >= at, q = seg(now, at, at + 400), [head, ...sub] = s.split(/:\s+/);
      return <div key={i} style={{ position: 'absolute', left: 44, top: 160 + i * gap - 30, right: 24, display: 'flex', gap: 22 }}>
        <div style={{ flex: 'none', width: 60, height: 60, borderRadius: 30, background: on ? KCY : '#3a4a5e', color: on ? KI : '#9fb0c2', fontFamily: MONO,
          fontWeight: 700, fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
        <div style={{ paddingTop: 6, transform: `translateX(${(1 - q) * 20}px)` }}>
          <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: fs, lineHeight: 1.15, color: on ? '#fff' : '#7d8ea3', opacity: 0.4 + 0.6 * q }}>{head}</div>
          {sub.length > 0 && <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: fs * 0.68, marginTop: 8, color: on ? '#b8cbd6' : '#5e6f84' }}>{sub.join(': ')}</div>}
        </div>
      </div>; })}
  </div>;
}

// step rail (D.rail): a strip across the top of the chart, one bar per step; the current bar fills over 1.6 s, the gold STEP chip
// slides in on every step change
function Rail({ r, now, box }) {
  const k = r.at.filter((x) => x.a <= now).length - 1, st = r.at[k].step, lt = now - r.at[k].a, n = r.steps.length;
  const o = seg(now, r.at[0].a, r.at[0].a + 300) * (1 - seg(now, r.z - 300, r.z)), rx = Math.max(40, box.left + 20), rw = Math.min(W - 80, Math.max(box.width - 40, 840));
  const cp = out(seg(lt, 0, 400));
  return <div style={{ opacity: o }}>
    <div style={{ position: 'absolute', left: rx - 12, top: 16, width: rw + 24, height: 88, background: 'rgba(7,16,26,.82)' }} />
    {r.steps.map((s, i) => { const sx = rx + (i * rw) / n + 6, sw = rw / n - 12, fl = i < st ? 1 : i === st ? out(seg(lt, 0, 1600)) : 0;
      return <React.Fragment key={i}>
        <div style={{ position: 'absolute', left: sx, top: 32, width: sw, height: 12, borderRadius: 6, background: '#3a4556', overflow: 'hidden' }}>
          <div style={{ width: `${fl * 100}%`, height: '100%', background: KB, borderRadius: 6 }} /></div>
        <div style={{ position: 'absolute', left: sx, top: 60, fontFamily: MONO, fontSize: 24, fontWeight: 500, color: i <= st ? '#fff' : '#7d8ea3', whiteSpace: 'nowrap' }}>{s}</div>
      </React.Fragment>; })}
    <KChip bg={KGOLD} fg={KI} size={26} font={MONO} style={{ left: -80 + 112 * cp, top: 148, opacity: cp, transform: 'translateY(-50%)' }}>
      STEP {st + 1} / {n} · {r.steps[st].toUpperCase()}</KChip>
  </div>;
}

// quick check (D.quick): card asks, a 3 s ring counts down, the answer lands in the card; the ring on the chart = mark 0 (render-props
// times it to the reveal); a dashed leader runs from the card to it
function Quick({ b, now, box, band, railOn, toScreen }) {
  const t = now - b.a, a = seg(t, 300, 800) * (1 - seg(now, b.z - 400, b.z)); if (a <= 0) return null;
  const cw = band ? box.w : 580, pin = b.graphic.pin && toScreen(b.graphic.pin);
  const x0 = band ? box.x : pin && pin[0] > W / 2 ? 40 : W - 620;
  const [q, ans] = b.graphic.parts, CH = 500, y0 = (band ? box.y + (box.h - CH) / 2 : railOn ? 280 : 220) - 40 * out(seg(t, 800, 1100));
  const rv = seg(t, 4600, 4900), cd = seg(t, 1600, 4600), R = 56, C = 2 * Math.PI * R;
  const leaderX = pin && pin[0] < x0 + cw / 2 ? x0 + 20 : x0 + cw - 20;
  return <>
    {pin && <ScreenArrow x1={leaderX} y1={y0 + 380} x2={pin[0] + 24} y2={pin[1]} p={io(seg(t, 1200, 1700)) * a} col={KL} w={6} dash="14 14" />}
    <div style={{ position: 'absolute', left: x0, top: y0, width: cw, height: CH, boxSizing: 'border-box', padding: '40px 40px 30px', opacity: a, overflow: 'hidden', background: '#fff',
      border: `6px solid ${KI}`, borderRadius: 24, boxShadow: '0 16px 36px rgba(0,0,0,.3)' }}>
      <Label col={KB}>QUICK CHECK</Label>
      <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: fitSize(q, cw - 92, 48, 28, 2), color: KI, marginTop: 16, lineHeight: 1.15 }}>{q}</div>
      <div style={{ position: 'absolute', left: 40, right: 40, top: 230, height: 230, display: 'flex', alignItems: 'center' }}>
        {rv < 1 && <svg width={R * 2 + 12} height={R * 2 + 12} style={{ position: 'absolute', left: '50%', top: 0, opacity: 1 - rv, transform: 'translateX(-50%)' }}>
          <circle cx={R + 6} cy={R + 6} r={R} fill="none" stroke={KGRID} strokeWidth={12} />
          <circle cx={R + 6} cy={R + 6} r={R} fill="none" stroke={KB} strokeWidth={12} strokeDasharray={`${C * (1 - cd)} ${C}`} transform={`rotate(-90 ${R + 6} ${R + 6})`} />
          <text x={R + 6} y={R + 10} textAnchor="middle" dominantBaseline="central" fontFamily={BODY} fontWeight={800} fontSize={53} fill={KI}>{Math.max(1, Math.ceil(3 * (1 - cd)))}</text>
        </svg>}
        {rv > 0 && <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', opacity: rv }}>
          <CheckSvg size={22} col={KB} w={10} p={rv} />
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: fitSize(ans, cw - 160, 34, 22, 4), color: KI, lineHeight: 1.3 }}>{ans}</div>
        </div>}
      </div>
    </div>
  </>;
}

// common mistake (D.mistake): red-edged card slides in from the left, pulses once; the candle's red ring = mark 0 (tone warn)
function Mistake({ b, now, box, band, railOn }) {
  const t = now - b.a, p = out(seg(t, 300, 800)) * (1 - io(seg(now, b.z - 500, b.z))); if (p <= 0) return null;
  const w = band ? box.w : 680, x = band ? box.x + (1 - p) * 80 : -w - 40 + (w + 76) * p, pl = 1 + 0.03 * Math.sin(seg(t, 1300, 1900) * Math.PI);
  const P = b.graphic.parts, fs = Math.min(...P.map((s) => fitSize(s, w - 106 - 64, 36, 24, 3)));
  return <div style={{ position: 'absolute', left: x, top: band ? box.y : railOn ? 196 : 140, width: w, height: band ? box.h : undefined, display: 'flex', alignItems: 'center', opacity: band ? c01(p * 1.5) : 1 }}>
    <div style={{ width: '100%', minHeight: 168, display: 'flex', background: '#fff', border: `6px solid ${KR}`,
      borderRadius: 16, boxShadow: '0 16px 36px rgba(0,0,0,.3)', transform: `scale(${pl})`, overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ flex: 'none', width: 106, background: KR, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={52} height={60} viewBox="0 0 52 60"><path d="M6,6 L46,54 M46,6 L6,54" stroke="#fff" strokeWidth={10} strokeLinecap="round" /></svg></div>
      <div style={{ padding: '30px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Label col={KR}>COMMON MISTAKE</Label>
        {P.map((s, i) => <div key={i} style={{ fontFamily: BODY, fontWeight: 800, fontSize: fs, color: i ? '#1B6B52' : KI, lineHeight: 1.22 }}>{s}</div>)}
      </div>
    </div>
  </div>;
}

// key rule (D.rule): the chart blurs + darkens, the one sentence sits centred on a light card (scale .92 -> 1)
function Rule({ b, now }) {
  const t = now - b.a, k = out(seg(t, 500, 1000)) * (1 - seg(now, b.z - 500, b.z)); if (k <= 0) return null;
  return <AbsoluteFill style={{ backdropFilter: `blur(${(16 * k).toFixed(1)}px) brightness(${(1 - 0.45 * k).toFixed(3)})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 1080, minHeight: 360, boxSizing: 'border-box', padding: '48px 60px', opacity: k, transform: `scale(${0.92 + 0.08 * k})`, background: '#f0f2ec',
      borderRadius: 20, boxShadow: '0 16px 36px rgba(0,0,0,.3)', textAlign: 'center' }}>
      <Label col="#52728f">THE RULE</Label>
      {b.graphic.parts.map((s, i, P) => <div key={i} style={{ fontFamily: BODY, fontWeight: 800, fontSize: Math.min(...P.map((x) => fitSize(x, 960, 60, 32, 2))), color: KNAVY, lineHeight: 1.25, marginTop: i ? 14 : 22 }}>{s}</div>)}
    </div>
  </AbsoluteFill>;
}

// coming up (D.tease): ink lower-third card, blue edge, bobbing gold down-arrow, a timer line draining to the beat's end
function Tease({ b, now, box, band, railOn }) {
  const t = now - b.a, p = out(seg(t, 300, 800)) * (1 - io(seg(now, b.z - 500, b.z))); if (p <= 0) return null;
  const w = band ? box.w : 860, x = band ? box.x : -w - 40 + (w + 76) * p, drain = 1 - seg(t, 1500, b.z - b.a - 500);
  const text = b.graphic.parts.join(' ');
  return <div style={{ position: 'absolute', left: x, top: band ? box.y : railOn ? 196 : 140, width: w, height: band ? box.h : undefined, display: 'flex', alignItems: 'center', opacity: band ? p : 1 }}>
    <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box', padding: '34px 110px 40px 48px', background: KI, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 14, background: KB }} />
      <Label col="#5fb0ff">COMING UP</Label>
      <div style={{ marginTop: 12, fontFamily: BODY, fontWeight: 800, fontSize: fitSize(text, w - 158, 46, 26, 3), lineHeight: 1.18, color: '#fff' }}>{text}</div>
      <svg width={40} height={52} viewBox="0 0 40 52" style={{ position: 'absolute', right: 34, top: '50%', marginTop: -26 + Math.sin((now / 1000) * 9) * 10 }}>
        <path d="M20,4 L20,40 M6,28 L20,44 L34,28" stroke={KGOLD} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div style={{ position: 'absolute', left: 48, bottom: 16, width: w - 158, height: 6, background: 'rgba(255,255,255,.18)' }}>
        <div style={{ width: `${drain * 100}%`, height: '100%', background: KB }} /></div>
    </div>
  </div>;
}

// astronaut aside (D.astro): the PipsGravity astronaut (the caption avatar) slides in from the right, the bubble's words pop in
// one by one (last word blue); the gold ring on the wick = mark 0
function Astro({ b, now }) {
  const t = now - b.a, p = out(seg(t, 300, 800)) * (1 - io(seg(now, b.z - 500, b.z))); if (p <= 0) return null;
  const ax = W + 160 + (W - 180 - W - 160) * p, ay = 560, words = b.graphic.parts.join(' ').split(/\s+/);
  return <>
    <div style={{ position: 'absolute', left: ax - 540, top: ay - 200, maxWidth: 480, opacity: c01(p * 1.4), background: '#fff', border: `8px solid ${KI}`, borderRadius: 28,
      padding: '22px 30px', fontFamily: BODY, fontWeight: 800, fontSize: 46, lineHeight: 1.2 }}>
      {words.map((w, i) => { const q = seg(t, 1800 + i * 220, 2000 + i * 220);
        return <span key={i} style={{ display: 'inline-block', marginRight: '0.28em', color: i === words.length - 1 ? KB : KI, opacity: q > 0 ? 1 : 0,
          transform: `scale(${popA(q)})` }}>{w}</span>; })}
      <div style={{ position: 'absolute', right: -44, bottom: -30, width: 60, height: 44, background: '#fff', borderRight: `8px solid ${KI}`, borderBottom: `8px solid ${KI}`,
        transform: 'skewX(40deg)' }} />
    </div>
    <Img src={staticFile('assets/avatar/profile_picture.jpg')} style={{ position: 'absolute', left: ax - 96, top: ay - 96, width: 192, height: 192, borderRadius: '50%',
      background: '#fff', border: `8px solid ${KI}`, boxShadow: `0 0 0 12px ${KB}` }} />
  </>;
}

// closing recap (D.recap): the chart blurs under a navy wash; one white card per recap sentence slides in from the left with a REAL
// frame of the lesson (graphic.frames, source ms) and its label
function Recap({ b, now, video, src, f }) {
  const t = now - b.a, fo = out(seg(t, 400, 1000)) * (1 - seg(now, b.z - 400, b.z)); if (fo <= 0) return null;
  const P = b.graphic.parts, n = P.length, gap = 36, sw = Math.min(560, (W - 160 - gap * (n - 1)) / n), rowW = n * sw + (n - 1) * gap, th = sw * 0.8;
  let bh = th - 32, bw = (bh * src.w) / src.h; if (bw > sw - 32) { bw = sw - 32; bh = (bw * src.h) / src.w; }
  return <AbsoluteFill style={{ backdropFilter: `blur(${(24 * fo).toFixed(1)}px)`, background: `rgba(19,33,58,${(0.35 * fo).toFixed(3)})`, opacity: fo > 0 ? 1 : 0 }}>
    {P.map((label, i) => { const at = partAt(b, i), p = out(seg(now, at, at + 600)); if (p <= 0) return null;
      const x = (W - rowW) / 2 + i * (sw + gap);
      return <div key={i} style={{ position: 'absolute', left: x, top: 240, width: sw, height: th + 140, background: '#fff', borderRadius: 28, opacity: fo,
        transform: `translateX(${(1 - p) * -(x + sw + 80)}px)`, boxShadow: '0 16px 36px rgba(0,0,0,.3)' }}>
        <div style={{ position: 'absolute', left: (sw - bw) / 2, top: 16 + (th - 32 - bh) / 2, width: bw, height: bh, overflow: 'hidden', borderRadius: 8 }}>
          <Freeze frame={0}><Clip src={video} from={f(b.graphic.frames[i])} /></Freeze></div>
        <div style={{ position: 'absolute', left: 16, right: 16, top: th + 44, textAlign: 'center', fontFamily: BODY, fontWeight: 800, fontSize: Math.min(32, sw / 15), color: KI }}>
          {i + 1} · {label}</div>
      </div>; })}
  </AbsoluteFill>;
}

// running recap stack (D.stack): a ticked card per stack beat, stacking up from the corner; the stack stays until the next chapter
// and comes back with every card so far at the next stack beat (the newest slides in from the right, the older ones lift 96 px)
function Stack({ cards, now }) {
  const shown = cards.filter((c) => c.a <= now); if (!shown.length || now >= shown.at(-1).z) return null;
  let s0 = shown.length - 1; while (s0 > 0 && shown[s0 - 1].z > shown[s0].a) s0--; // start of this visible run
  const o = seg(now, shown[s0].a, shown[s0].a + 300) * (1 - seg(now, shown.at(-1).z - 300, shown.at(-1).z));
  // card grows to its text (max 820 px); text sized to one line, never cut with "..."
  return <div style={{ opacity: o }}>{shown.map((c, i) => {
    const fs = fitSize(c.text, 820 - 110, 32, 20, 1), w = Math.min(820, Math.ceil(c.text.length * fs * 0.66) + 110);
    const p = i >= s0 ? out(seg(now, c.a, c.a + 400)) : 1; let off = 0;
    for (let j = i + 1; j < shown.length; j++) off += (j >= s0 ? out(seg(now, shown[j].a, shown[j].a + 400)) : 1) * 96;
    return <div key={i} style={{ position: 'absolute', left: W + 40 + (W - 36 - w - W - 40) * p, top: 700 - off, width: w, height: 80, opacity: p, background: '#fff',
      border: `4px solid ${KGRID}`, borderRadius: 16, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 18, paddingLeft: 22, boxShadow: '0 10px 24px rgba(0,0,0,.25)' }}>
      <div style={{ flex: 'none', width: 44, height: 44, borderRadius: 22, background: KB, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CheckSvg size={10} col="#fff" w={6} /></div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: fs, color: KI, whiteSpace: 'nowrap' }}>{c.text}</div>
    </div>; })}</div>;
}

const PRES = { definition: Definition, spine: Spine, quick: Quick, mistake: Mistake, rule: Rule, tease: Tease, astro: Astro, recap: Recap,
  'a-chapter': ChapterCut, 'p-title': TitleCut, 'p-statement': StatementCut, 'p-list': ListCut, 'p-metric': MetricCut,
  'p-diagram': DiagramCut, 'p-crowd': CrowdCut, 'p-recap': ChapterRecapCut, 'p-endcard': EndCardCut, 'a-loop': LoopCut };

const Chip = ({ text, style }) => (
  <div style={{ position: 'absolute', ...style, background: NAVY, color: '#fff', fontFamily: HEAD, fontSize: 30, letterSpacing: 2,
    padding: '8px 18px', borderRadius: 10, border: `3px solid ${GOLD}` }}>{text}</div>
);

function Chapter({ chapters, now }) {
  const c = chapters.filter((x) => x.a <= now).at(-1); if (!c) return null;
  const e = out(c01((now - c.a) / 400));
  return <Chip text={c.name.toUpperCase()} style={{ left: 36, top: 32, opacity: e, transform: `translateY(${(1 - e) * -16}px)` }} />;
}

// ── talking captions (design v2: always on) ─────────────────────────────────────
// The approved short-form astronaut build (artifact 70183e1f…), exactly as RepurposeLongForm's WP1 port: every px
// value scaled by frame height (K), bubble hugs its line (max 62%), lines alternate sides. Chunking = Owner v4: a line
// runs to the end of its sentence (>= 3 words), no word cap; 24-word safety break for an unpunctuated run.
// Gold words: a caption word flagged `gold` upstream (the key word a mark or card highlight fires on) gets the
// short-form gold marker sweep.
const K = H / 1920, AV = Math.round(240 * K), CAP_INK = '#13213A';
const pop = (p) => { p = c01(p); const k = 1.9; return 1 + (k + 1) * (p - 1) ** 3 + k * (p - 1) ** 2; };
export function captionLines(words) {
  const chunks = []; let cur = [];
  words.forEach((w) => { cur.push(w); if ((/[.!?]$/.test(w.w) && cur.length >= 3) || cur.length >= 24) { chunks.push(cur); cur = []; } });
  if (cur.length) chunks.push(cur);
  return chunks;
}
function Captions({ words, now, fps }) {
  const chunks = React.useMemo(() => captionLines(words), [words]);
  if (!words.length || now < words[0].a) return null;
  let k = 0; chunks.forEach((c, i) => { if (now >= c[0].a) k = i; });
  const line = chunks[k], right = k % 2 === 1, fr = (ms) => (ms * fps) / 1000;
  const sinceFirst = fr(now - words[0].a), sinceLine = fr(now - line[0].a), bubbleF = k === 0 ? sinceLine - 3 : sinceLine;
  let bob = 0; line.forEach((w) => { const d = fr(now - w.a); if (d >= 0 && d < 5) bob = Math.max(bob, 1 - d / 5); });
  return (
    <div style={{ position: 'absolute', left: 96, right: 96, bottom: 56, display: 'flex', flexDirection: right ? 'row-reverse' : 'row',
      alignItems: 'flex-end', gap: 26 * K }}>
      <Img src={staticFile('assets/avatar/profile_picture.jpg')} style={{ flex: 'none', width: AV, height: AV, borderRadius: '50%',
        background: '#fff', border: `${8 * K}px solid ${GOLD}`, boxShadow: `0 0 0 ${6 * K}px ${CAP_INK}, 0 ${12 * K}px ${30 * K}px rgba(0,0,0,.35)`,
        transform: `scale(${pop(sinceFirst / 9)}) translateY(${-10 * K * bob}px)` }} />
      <div style={{ position: 'relative', flex: '0 1 auto', maxWidth: '62%', background: '#fff', border: `${6 * K}px solid ${CAP_INK}`,
        borderRadius: 44 * K, padding: `${44 * K}px ${46 * K}px ${40 * K}px`, boxShadow: `0 ${12 * K}px ${30 * K}px rgba(0,0,0,.28)`,
        opacity: c01(bubbleF / 4), transform: `scale(${0.4 + 0.6 * pop(bubbleF / 9)})`, transformOrigin: right ? '100% 100%' : '0 100%' }}>
        {/* tail pointing at the avatar */}
        <div style={{ position: 'absolute', bottom: 34 * K, [right ? 'right' : 'left']: -30 * K, width: 44 * K, height: 44 * K, background: '#fff',
          borderBottom: `${6 * K}px solid ${CAP_INK}`, [right ? 'borderRight' : 'borderLeft']: `${6 * K}px solid ${CAP_INK}`,
          transform: right ? 'skewY(28deg) rotate(-18deg)' : 'skewY(-28deg) rotate(18deg)' }} />
        <div style={{ position: 'absolute', top: -30 * K, [right ? 'right' : 'left']: 40 * K, background: CAP_INK, color: GOLD, fontFamily: HEAD,
          fontSize: 30 * K, fontWeight: 700, lineHeight: 1, letterSpacing: 3 * K, padding: `${12 * K}px ${22 * K}px`, borderRadius: 12 * K,
          textTransform: 'uppercase', whiteSpace: 'nowrap' }}>PipsGravity</div>
        <div style={{ fontFamily: BODY, fontSize: 58 * K, fontWeight: 800, lineHeight: 1.3, color: CAP_INK }}>
          {line.map((w, i) => {
            const f = fr(now - w.a), g = w.gold;
            return <span key={i} style={{ display: 'inline-block', marginRight: '0.26em', opacity: c01(f / 3),
              transform: `translateY(${(1 - c01(f / 5)) * 18 * K}px) scale(${0.7 + 0.3 * pop(f / 6)})`,
              ...(g ? { backgroundImage: `linear-gradient(${GOLD}, ${GOLD})`, backgroundRepeat: 'no-repeat', backgroundPosition: '0 85%',
                backgroundSize: `${(out(c01(f / 8)) * 100).toFixed(0)}% 45%`, padding: '0 0.08em' } : {}) }}>{w.w}</span>;
          })}
        </div>
      </div>
    </div>
  );
}
