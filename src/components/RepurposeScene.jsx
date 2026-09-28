// ── components/RepurposeScene.jsx ────────────────────────────────────────────
// Remotion composition for the video repurposing freeze-and-explain format.
// render_type: 'REPURPOSE_SCENE'
//
// HOW THE FREEZE-AND-EXPLAIN MODEL WORKS:
//   Source video plays normally (LIVE segment) until a voiceover timestamp.
//   At that timestamp the video FREEZES on that exact frame (FREEZE segment).
//   While frozen: voiceover audio plays + talking-astronaut bubble shows words as spoken.
//   Then the video RESUMES from that point (next LIVE segment).
//   This repeats for every segment in the narration sequence.
//
// LAYOUT (1080 × 1920, 9:16 vertical):
//   Background      — white fills all space not covered by video
//   Video layer     — source video scaled to fill 1080px wide, letterboxed vertically
//                     Original audio is MUTED (volume=0) — voiceover replaces it
//   Lesson Title    — dark pill overlay, pinned to TOP of canvas, full duration
//                     Always visible regardless of source video aspect ratio
//   Captions        — astronaut avatar + speech bubble, BOTTOM of canvas, freeze only
//                     Always visible regardless of source video aspect ratio
//   CTA banner      — 1080×110px pre-baked image, bottom 440px, CTA segment only
//   Voiceover audio — each freeze segment plays its own WAV chunk
//   BGM             — background music at low volume, loops the full composition
//
// ASPECT RATIO HANDLING:
//   Title and captions use dark semi-transparent pill backgrounds so they are
//   readable on ANY surface — white letterbox space, chart content, or full-bleed
//   portrait video. No letterboxMargin calculation needed. Works for all inputs:
//     Square (720×720), Landscape (1920×1080), Portrait (1080×1920), anything.
//
// SCENE JSON SHAPE received from renderer.js (after file setup):
// {
//   render_type:       'REPURPOSE_SCENE',
//   folder_name:       'VR_xxx',
//   source_video_url:  'http://localhost:PORT/public/tmp_renders/VR_xxx_ts/source.mp4',
//   cta_banner_url:    'http://localhost:PORT/public/tmp_renders/VR_xxx_ts/cta_banner.png',
//   bg_music_url:      'http://localhost:PORT/public/assets/bgm/ambient_calm.mp3',
//   lesson_title:      'How To Trade BOS + Order Block Into BSL',
//   fps:               30,
//   canvas:            { w: 1080, h: 1920 },
//   duration_ms:       45000,
//   brand:             { primary, accent, font_heading, font_body },
//   sequence: [
//     { type: 'live',   start_time: 0,   end_time: 5.5 },
//     { type: 'freeze', segment_id: 1,   timestamp: 5.5,
//       audio_url: 'http://localhost:PORT/public/tmp_renders/VR_xxx_ts/audio_1.wav',
//       duration: 3.9,  event_type: 'commentary',  show_cta: false,
//       captions: [{ word: 'Here', start: 0.0, end: 0.25 }, ...] },
//     ...
//   ]
// }

import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Freeze,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// ── Canvas constants ──────────────────────────────────────────────────────────
const CANVAS_W = 1080;
const CANVAS_H = 1920;

// Title pill: distance from the top edge of the canvas
const TITLE_TOP      = 60;

// Caption pill: distance from the bottom edge of the canvas
const CAPTION_BOTTOM = 80;

// CTA banner: 1080×110px pre-baked image, positioned near bottom of video area
const CTA_BOTTOM = 440;
const CTA_H      = 110;

// BGM volume: low enough to never compete with voiceover
const BGM_VOLUME = 0.10;


// ── RepurposeScene ───────────────────────────────────────────────────────────
// Top-level composition. Pre-calculates frame offsets for all segments,
// then renders each as either a LiveSegment or FreezeSegment.
// LessonTitle and BGM are rendered at the root level (full composition duration).
export const RepurposeScene = ({ sceneJson }) => {
  const { fps } = useVideoConfig();

  const sequence    = sceneJson.sequence        || [];
  const srcUrl      = sceneJson.source_video_url;
  const ctaUrl      = sceneJson.cta_banner_url;
  const bgMusicUrl  = sceneJson.bg_music_url;
  const lessonTitle = sceneJson.lesson_title    || '';
  const brand       = sceneJson.brand           || {};

  // ── Pre-calculate absolute frame offsets ──────────────────────────────────
  // Each segment needs a frameStart (composition frame where it begins) and
  // frameCount (how many frames it lasts). Walk the sequence once.
  const segmentsWithFrames = [];
  let frameOffset = 0;

  // Sources often fade in from black, so the hook never freezes on second 0: it holds
  // the last lesson frame (what hook_stamp names), or the first one after a
  // flash-forward rewind (Owner 2026-09-15, black opening frame in run 64818).
  const lessonTs = sequence.filter((s) => s.type === 'freeze' && s.event_type === 'commentary').map((s) => s.timestamp);
  const hookTs = (fx) => (fx === 'flash_forward' ? lessonTs[0] : lessonTs[lessonTs.length - 1]);

  let freezeCount = 0;
  for (const raw of sequence) {
    const seg = !lessonTs.length ? raw
      : raw.type === 'flash' ? { ...raw, rewind_to: lessonTs[0] }
      : raw.type === 'freeze' && raw.event_type === 'hook' ? { ...raw, timestamp: hookTs(raw.fx) }
      : raw;
    // Must match segSeconds() in n8n "Prepare Render Context" (sets duration_ms).
    const durationSec = seg.type === 'live'
      ? (seg.end_time - seg.start_time) / (seg.fx === 'speed' ? FX_SPEED : 1)
      : seg.duration;
    const frameCount = Math.ceil(durationSec * fps);

    // Talking captions switch sides per pause: 1st freeze left, 2nd right, ...
    const side = seg.type !== 'freeze' ? null : (freezeCount++ % 2 ? 'right' : 'left');
    segmentsWithFrames.push({ ...seg, frameStart: frameOffset, frameCount, side });
    frameOffset += frameCount;
  }
  const layout = bandLayout(sceneJson.source_width, sceneJson.source_height);
  // V1 hook pool: the headline owns the top band during the hook, the title pill comes in after it.
  const hookSeg = segmentsWithFrames.find((s) => s.hook_visual);
  const titleFrom = hookSeg ? hookSeg.frameStart + hookSeg.frameCount : 0;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#FFFFFF' }}>

      {/* ── VIDEO SEGMENTS ──────────────────────────────────────────────────
          Live and freeze segments rendered in sequence order.
          Each Sequence clips rendering to its time window.
          seg.fx = retention effect picked at random per slot in n8n. */}
      {segmentsWithFrames.map((seg, i) =>
        seg.type === 'live' ? (
          <LiveSegment
            key={i}
            seg={seg}
            srcUrl={srcUrl}
            fps={fps}
            brand={brand}
            layout={layout}
          />
        ) : seg.type === 'flash' ? (
          <FlashSegment key={i} seg={seg} srcUrl={srcUrl} fps={fps} brand={brand} layout={layout} />
        ) : (
          <FreezeSegment
            key={i}
            seg={seg}
            srcUrl={srcUrl}
            ctaUrl={ctaUrl}
            fps={fps}
            brand={brand}
            sourceW={sceneJson.source_width}
            sourceH={sceneJson.source_height}
            layout={layout}
            prevFx={segmentsWithFrames[i - 1]?.type === 'flash' ? 'flash' : null}
            whipOut={segmentsWithFrames[i + 1]?.fx === 'whip'}
          />
        )
      )}

      {/* ── LESSON TITLE ────────────────────────────────────────────────────
          Outside any Sequence — visible for the entire composition duration.
          Dark pill overlay pinned to top of canvas.
          Renders on any aspect ratio — no letterbox dependency. */}
      {lessonTitle && (
        <LessonTitle title={lessonTitle} brand={brand} from={titleFrom} />
      )}

      {/* ── BACKGROUND MUSIC ────────────────────────────────────────────────
          Outside any Sequence — plays for the full composition.
          Low volume so it never covers the voiceover.
          Loops if the composition is longer than the BGM track. */}
      {bgMusicUrl && (
        <Audio src={bgMusicUrl} volume={BGM_VOLUME} loop />
      )}

    </AbsoluteFill>
  );
};


// ── LiveSegment ───────────────────────────────────────────────────────────────
// Source video plays from start_time to end_time at normal speed.
// volume={0}: original audio muted — voiceover replaces it.
// No captions or audio overlay — those belong to freeze segments only.
function LiveSegment({ seg, srcUrl, fps, brand, layout }) {
  const t = (useCurrentFrame() - seg.frameStart) / fps;
  // whip: the video slides in from the right over 0.3 s with motion blur
  const whip = seg.fx === 'whip' && t < FX_WHIP ? 1 - easeOut3(t / FX_WHIP) : 0;
  return (
    <Sequence from={seg.frameStart} durationInFrames={seg.frameCount}>
      <AbsoluteFill style={whip ? { transform: `translateX(${(whip * CANVAS_W).toFixed(0)}px)`, filter: `blur(${(whip * 24).toFixed(1)}px)` } : undefined}>
        <OffthreadVideo
          src={srcUrl}
          startFrom={Math.round(seg.start_time * fps)}
          endAt={Math.round(seg.end_time * fps)}
          playbackRate={seg.fx === 'speed' ? FX_SPEED : 1}
          volume={0}
          style={{
            width:     '100%',
            height:    '100%',
            objectFit: 'contain',
          }}
        />
      </AbsoluteFill>
      {seg.fx === 'speed' && (
        <FxChip text="1.5× ▶▶" x={CANVAS_W - 190} y={layout.chipY} size={38} light brand={brand} t={t - 0.1} fps={fps} />
      )}
      {seg.fx === 'next_tease' && <NextTease text={seg.fx_text} t={t} dur={seg.frameCount / fps} layout={layout} brand={brand} />}
    </Sequence>
  );
}


// ── Retention effects (Owner-approved v2 options, maint retention-edits-v2) ─────
// n8n picks one effect per slot at random, no repeats inside a video until a pool
// runs out: hook = flash_forward | hook_stamp, pause = pause_signal | key_term |
// gold_words, live = whip | speed | next_tease, closing = recap. The product
// pop-up is NOT an effect and is never changed by these; they render beneath it.
const FX_SPEED = 1.5;
const FX_WHIP  = 0.3;   // s
const easeOut3 = (p) => 1 - (1 - clamp01(p)) ** 3;

// Where the empty white bands are for a source contained in 1080×1920.
// Portrait sources have no band: labels then sit over the video, under the title.
function bandLayout(sw, sh) {
  const vh     = sw && sh ? Math.min(CANVAS_H, (CANVAS_W * sh) / sw) : CANVAS_W;
  const top    = (CANVAS_H - vh) / 2;
  const bottom = top + vh;
  return { top, bottom, labelY: Math.max(270, top - 90), chipY: Math.max(260, top + 60), teaseY: Math.min(1700, bottom + 120), midY: CANVAS_H / 2 };
}

function FxChip({ text, x, y, size = 46, light, bg, t, fps, out = Infinity, brand }) {
  if (t < 0 || t > out + 0.3) return null;
  const f = t * fps;
  return (
    <div style={{
      position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${pop(f / 8)})`,
      opacity: clamp01(f / 3) * (1 - clamp01((t - out) / 0.3)),
      background: bg || (light ? '#FFFFFF' : INK), color: light ? INK : '#FFFFFF',
      fontFamily: `${brand.font_heading || 'Oswald'}, Arial, sans-serif`, fontSize: size, fontWeight: 700,
      letterSpacing: 2, textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1,
      padding: `${size * 0.4}px ${size * 0.7}px`, borderRadius: size * 0.4,
      boxShadow: '0 10px 26px rgba(0,0,0,.3)',
    }}>{text}</div>
  );
}

const WhiteFlash = ({ a }) => (a > 0 ? <AbsoluteFill style={{ background: '#FFFFFF', opacity: clamp01(a) }} /> : null);

// "<NEXT EVENT> NEXT ↓" bar slides into the bottom band while the video plays.
function NextTease({ text, t, dur, layout, brand }) {
  const outAt = Math.max(1.4, Math.min(dur - 0.4, 4.3));
  const x = (-1 + easeOut3((t - 0.3) / 0.4) - clamp01((t - outAt) / 0.4) ** 3) * CANVAS_W;
  if (t < 0.3 || t > outAt + 0.4) return null;
  return (
    <div style={{
      position: 'absolute', left: 60, width: 960, top: layout.teaseY - 75, height: 150, borderRadius: 20,
      background: INK, color: brand.accent || '#C9A84C', transform: `translateX(${x.toFixed(0)}px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 50px', boxSizing: 'border-box',
      fontFamily: `${brand.font_heading || 'Oswald'}, Arial, sans-serif`, fontSize: 60, fontWeight: 700, letterSpacing: 2,
    }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
      <span style={{ transform: `translateY(${(Math.sin(t * 9) * 10).toFixed(1)}px)` }}>↓</span>
    </div>
  );
}

// ── V1 hook pool (Owner 2026-09-28): one hook per video, n8n sets seg.hook_visual ──
// H0 = headline + push-in (control), H1 = headline + chart marks/zoom, H3 = "your call" question + push-in.
// The headline is fully visible on frame 0 (sound-off swipe window) and sits in the top band above the video.
// ponytail: 0.55em per char stands in for measuring Oswald 700 caps; switch to @remotion/layout-utils fitText if it clips.
const HOOK_PUSH = 0.08;   // whole-frame push-in over the hook
function HookHeadline({ text, question, t, fps, layout, brand }) {
  const w = 880, words = String(text).split(/\s+/);
  const longest = Math.max(...words.map((x) => x.length)), CH = 0.55;
  const size = Math.floor(Math.min(104, w / (longest * CH), (2 * w * 0.92) / (String(text).length * CH)));
  const bottom = Math.max(380, layout.top - 36);
  return (
    <div style={{
      position: 'absolute', left: 60, right: 60, top: 70, height: bottom - 70,
      display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        transform: `scale(${(1 + 0.04 * (1 - easeOut3((t * fps) / 6))).toFixed(4)})`,
        background: INK, borderRadius: 26, padding: '26px 40px', boxShadow: '0 14px 34px rgba(0,0,0,.35)',
        textAlign: 'center', fontFamily: `${brand.font_heading || 'Oswald'}, Arial, sans-serif`, fontWeight: 700,
        textTransform: 'uppercase', lineHeight: 1.05, letterSpacing: 1,
      }}>
        {question && <div style={{ color: brand.accent || '#C9A84C', fontSize: 44, letterSpacing: 4, marginBottom: 10 }}>YOUR CALL</div>}
        <div style={{ color: '#FFFFFF', fontSize: size }}>{text}</div>
      </div>
    </div>
  );
}

// Flash-forward: open on the last lesson frame with the tease, then rewind to 0.
function FlashSegment({ seg, srcUrl, fps, brand, layout }) {
  const t     = (useCurrentFrame() - seg.frameStart) / fps;
  const hold  = seg.duration - 0.7;
  const rew   = clamp01((t - hold) / 0.7);
  const to    = seg.rewind_to || 0;
  const shown = seg.timestamp - (seg.timestamp - to) * rew * rew * (3 - 2 * rew);
  return (
    <Sequence from={seg.frameStart} durationInFrames={seg.frameCount}>
      <AbsoluteFill style={rew > 0 ? { filter: 'grayscale(0.6)' } : undefined}>
        <Freeze frame={Math.round(shown * fps)}>
          <AbsoluteFill>
            <OffthreadVideo src={srcUrl} volume={0} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </AbsoluteFill>
        </Freeze>
      </AbsoluteFill>
      {rew > 0 && <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 6px, transparent 6px 18px)' }} />}
      {rew > 0
        ? <FxChip text="◀◀ REWIND" x={CANVAS_W / 2} y={layout.labelY} size={48} light brand={brand} t={t - hold} fps={fps} />
        : <FxChip text={seg.fx_text} x={CANVAS_W / 2} y={layout.labelY} size={54} brand={brand} t={t} fps={fps} />}
    </Sequence>
  );
}

// One font size for every recap label: the longest word fits one line and the whole
// label fits two. 0.62em = bold uppercase width in the Arial fallback (widest case).
// ponytail: width estimate, not measured; use @remotion/layout-utils measureText if labels still clip.
function recapFontSize(texts, width) {
  const CH = 0.62;
  const longestWord = Math.max(...texts.flatMap((s) => s.split(/\s+/)).map((w) => w.length));
  const longestText = Math.max(...texts.map((s) => s.length));
  return Math.floor(Math.max(18, Math.min(36, width / (longestWord * CH), (2 * width * 0.9) / (longestText * CH))));
}

// Recap focus: the frozen chart blurs + dims as the first card arrives (0.6 s).
const RECAP_BLUR_PX = 12;
const recapFocus = (t) => easeOut3((t - 0.4) / 0.6);

// Closing recap: each lesson's frame pops in as a labelled card, then stays.
// Cards trim with startFrom + Freeze frame 0: Freeze frame={ts*fps} here showed the
// wrong source second (10 s for 12 s and 18 s) in local stills, 2026-09-15.
function RecapCards({ cards, t, srcUrl, fps, layout }) {
  const n = cards.length;
  const gap = 22;
  const s = Math.min(310, (CANVAS_W - 90 - gap * (n - 1)) / n);
  const rowW = n * s + (n - 1) * gap;
  const texts = cards.map((c, i) => (c.label ? `${i + 1} · ${c.label}` : `${i + 1}`));
  const fontSize = recapFontSize(texts, s - 24);
  const labelH = Math.ceil(fontSize * 2.3 + 16);   // two lines + breathing room
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: INK, opacity: 0.35 * recapFocus(t) }} />
      {cards.map((c, i) => {
        const p = easeOut3((t - 0.6 - i * 0.45) / 0.6);
        if (p <= 0) return null;
        const x = (CANVAS_W - rowW) / 2 + i * (s + gap);
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: layout.midY - (s + labelH) / 2 - 8, width: s, padding: 8, borderRadius: 18,
            background: '#FFFFFF', boxShadow: '0 16px 40px rgba(0,0,0,.5)',
            transform: `translateX(${((1 - p) * -(x + s + 40)).toFixed(0)}px)`,
          }}>
            <div style={{ width: s, height: s, overflow: 'hidden', borderRadius: 12, position: 'relative' }}>
              <Freeze frame={0}>
                <AbsoluteFill>
                  <OffthreadVideo src={srcUrl} startFrom={Math.round(c.timestamp * fps)} volume={0} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </AbsoluteFill>
              </Freeze>
            </div>
            <div style={{
              height: labelH, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              color: INK, fontFamily: 'Oswald, Arial, sans-serif', fontWeight: 700, lineHeight: 1.1,
              fontSize, overflowWrap: 'normal', overflow: 'hidden',
            }}>{texts[i]}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}


// ── Chart Marks (V0.1, Owner 2026-09-28: marks + zoom on every pause) ──────────
// seg.chart = CE_Agent_Charts' render for this pause: { frame_ms, W, H, crop:[x0,y0,x1,y1], marks } in the
// solver's working px, mark times in ms from the pause start. The solver owns every anchor and every tag text;
// this only maps solver px -> canvas px. Style = the approved long-form label library (RepurposeLongForm
// ChartOverlay, STEP2_GATE_REGISTER) — copied, not imported, so long form stays untouched.
const MARK_INK = '#E8590C';
const MARK_ZONE = { demand: '#0FA3B1', supply: '#D6336C' };
const MARK_STYLE = {
  bos: { dash: 'dash' }, choch: { dash: 'dash' }, liquidity_level: { dash: 'dash' }, inducement: { dash: 'dot' },
  order_block: { box: true }, fvg_box: { box: true, dash: 'dash', colour: '#786EC8' },
  range_box: { box: true, dash: 'dash', colour: '#8A96A0' }, expected_path: { dash: 'dash', slow: true },
};
const MARK_TAG_BELOW = /^(SSL|EQL|Sell|Equal lows|Discount)/i;
const CAM_MS = 850, CAM_MAX = 1.5;   // prototype camera ease; pt72b preview push-in 1.5x

// where the contained source sits on the canvas, and solver px -> canvas px
function chartGeom(chart, sw, sh) {
  const dw = Math.min(CANVAS_W, (CANVAS_H * sw) / sh), dh = (dw * sh) / sw;
  const left = (CANVAS_W - dw) / 2, top = (CANVAS_H - dh) / 2, k = dw / chart.W;
  const [x0, y0, x1, y1] = chart.crop || [0, 0, chart.W, chart.H];
  return { dw, dh, left, top, k, P: (pt) => [left + pt[0] * k, top + pt[1] * k],
    crop: [left + x0 * k, top + y0 * k, left + x1 * k, top + y1 * k] };
}

// push-in on the solver's crop, eased over the first 850 ms of the pause, then held
function ChartZoom({ chart, sw, sh, t, push, children }) {
  if (!chart || !sw || !sh) {
    // V1 hook H0/H3: slow whole-frame push-in so the opening frame is never a still picture
    const s = push ? 1 + HOOK_PUSH * Math.min(1, t / push) : 1;
    return <AbsoluteFill style={push ? { transform: `scale(${s.toFixed(4)})` } : undefined}>{children}</AbsoluteFill>;
  }
  const g = chartGeom(chart, sw, sh), [cx0, cy0, cx1, cy1] = g.crop;
  const z = Math.max(1, Math.min(CAM_MAX, g.dw / ((cx1 - cx0) * 1.15)));
  const p = easeOut3((t * 1000) / CAM_MS), s = 1 + (z - 1) * p;
  // scaling about the crop centre keeps the crop where it is and never pulls the video edge inward
  return (
    <AbsoluteFill style={{ transformOrigin: `${(cx0 + cx1) / 2}px ${(cy0 + cy1) / 2}px`, transform: `scale(${s.toFixed(4)})` }}>
      {children}
    </AbsoluteFill>
  );
}

function ChartMarks({ chart, sw, sh, tMs }) {
  if (!sw || !sh) return null;
  const { P } = chartGeom(chart, sw, sh);
  const tags = [];
  const shapes = chart.marks.map((m, i) => {
    const st = MARK_STYLE[m.label] || {};
    const col = st.box ? MARK_ZONE[m.tone] || st.colour || MARK_INK : st.colour || MARK_INK;
    const start = (m.at_ms || 0) + (m.stagger || 0) * 90, dur = st.slow ? 900 : 520;
    const p = interpolate(tMs, [start, start + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    if (p <= 0) return null;
    const A = m.from && m.from.point ? P(m.from.point) : null, B = m.to && m.to.point ? P(m.to.point) : null;
    if (!A && !B) return null;
    const w = 5, dash = st.dash === 'dot' ? '3 9' : st.dash === 'dash' ? '18 13' : undefined, key = m.id || `m${i}`;
    const tag = (x, y, below) => m.text && tags.push({ key, x, y, below, col, text: m.text, o: p });
    if (m.kind === 'highlight' && A && B && (st.box || Math.abs(B[1] - A[1]) > 14)) {
      const bx = Math.min(A[0], B[0]), by = Math.min(A[1], B[1]), bw = Math.abs(B[0] - A[0]), bh = Math.abs(B[1] - A[1]);
      tag(bx + bw / 2, by, false);
      return <rect key={key} x={bx} y={by} width={Math.max(1, bw * p)} height={bh} fill={col} fillOpacity={0.18} stroke={col} strokeWidth={w} strokeDasharray={dash} />;
    }
    if ((m.kind === 'highlight' || m.kind === 'arrow') && A && B) {
      tag((A[0] + B[0]) / 2, Math.min(A[1], B[1]), MARK_TAG_BELOW.test(m.text || ''));
      return <line key={key} x1={A[0]} y1={A[1]} x2={A[0] + (B[0] - A[0]) * p} y2={A[1] + (B[1] - A[1]) * p} stroke={col} strokeWidth={w} strokeLinecap="round" strokeDasharray={dash} />;
    }
    if (m.kind === 'ring') {
      const at = B || A, rx = m.label === 'candle_highlight' ? 30 : 22, ry = 30, c = 2 * Math.PI * ((rx + ry) / 2);
      tag(at[0], at[1] - ry, false);
      return <ellipse key={key} cx={at[0]} cy={at[1]} rx={rx} ry={ry} fill="none" stroke={col} strokeWidth={w} strokeDasharray={c} strokeDashoffset={c * (1 - p)} />;
    }
    return null;   // fail closed: a kind this pause renderer does not draw is skipped, never approximated
  });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={CANVAS_W} height={CANVAS_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} style={{ position: 'absolute', inset: 0 }}>{shapes}</svg>
      {tags.map((tg) => (
        <div key={tg.key} style={{
          position: 'absolute', left: tg.x, top: tg.y, transform: `translate(-50%, ${tg.below ? '28%' : '-128%'})`,
          opacity: tg.o, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 800, fontSize: 30, lineHeight: 1.15,
          color: tg.col, background: '#FFFFFF', border: `3px solid ${tg.col}`, borderRadius: 8, padding: '4px 11px', whiteSpace: 'nowrap',
        }}>{tg.text}</div>
      ))}
    </AbsoluteFill>
  );
}


// ── Hook Pool v4 (Owner approved all 20 + SFX, 2026-09-29) ─────────────────────
// Ported from the approved prototypes (maintenance/video-repurposing-experiments/v1-hooks/v4-parts: new.css +
// hook-pool-v3.src.bak.html). Each prototype runs on one 7 s CSS loop, so a keyframe at p% there is p*0.07 s here.
// There the zone sat at 52%/21% of the chart. Here every position comes from the hook's lesson mark (the first
// mark of seg.chart), and search paths start from fixed chart spots. SFX strings are the prototypes' data-sfx
// cues (file@sec~cut). H1+ drops its "drop line" + draw_pen cue: it needs the move end-point, which is not wired yet.
const HOOK_ALIAS = { H6b: 'H6r', H2: 'H1+', H2b: 'H1+', H2c: 'H1+', H13: 'H1+', H13b: 'H1+' };   // data not wired yet
const SFX_VOLUME = 0.5;           // under the voice
const U = CANVAS_W / 100;         // the prototype's cqw
const EZ = Easing.bezier(0.2, 0.7, 0.2, 1), EZ_IO = Easing.bezier(0.42, 0, 0.58, 1), EZ_OUT = Easing.bezier(0, 0, 0.58, 1), LIN = (x) => x;
// k(t, [[pct, value], ...], easing) = prototype keyframes, held before the first and after the last stop
const k = (t, pts, easing = EZ) => interpolate(t, pts.map((p) => p[0] * 0.07), pts.map((p) => p[1]), { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const GOLD = '#FFD66B', ORANGE = '#FF7A45';

// the hook's zone in canvas px (pre-camera), from the first mark with an anchor; a thin level line gets a band
function hookTarget(chart, sw, sh) {
  const m = chart && sw && sh && (chart.marks || []).find((x) => (x.from && x.from.point) || (x.to && x.to.point));
  if (!m) return null;
  const g = chartGeom(chart, sw, sh);
  const a = m.from && m.from.point ? g.P(m.from.point) : g.P(m.to.point), b = m.to && m.to.point ? g.P(m.to.point) : a;
  let [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const minW = 0.2 * g.dw, minH = 0.06 * g.dw;
  // focus = where a close-up should look: a box's centre, but a thin level line's left end (its origin swing), not its empty middle
  const line = y1 - y0 < minH, fx = line ? x0 : (x0 + x1) / 2, fy = (y0 + y1) / 2;
  if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
  if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
  return { g, x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, fx, fy, line, text: String(m.text || '').toUpperCase() };
}

const abs = (style) => ({ position: 'absolute', ...style });
const Zone = ({ T, style }) => <div style={abs({ left: T.x, top: T.y, width: T.w, height: T.h, ...style })} />;
const WorldFill = ({ T, style }) => <div style={abs({ left: T.g.left, top: T.g.top, width: T.g.dw, height: T.g.dh, ...style })} />;
const Tag = ({ text, x, y, style }) => (text ? (
  <div style={abs({ left: x, top: y, font: `700 ${3.6 * U}px/1 Oswald, Arial, sans-serif`, color: '#FFFFFF', background: '#E4572E',
    padding: `${0.8 * U}px ${1.6 * U}px`, borderRadius: U, whiteSpace: 'nowrap', ...style })}>{text}</div>
) : null);
const Locked = ({ o, s }) => (
  <span style={abs({ left: 0, top: -U, transform: `translateY(-100%) scale(${s})`, opacity: o, font: `700 ${3.4 * U}px/1 'IBM Plex Mono', Consolas, monospace`,
    color: '#13203A', background: GOLD, padding: `${0.8 * U}px ${1.4 * U}px`, borderRadius: 0.8 * U })}>LOCKED</span>
);
const Brackets = () => ['left:0;top:0', 'right:0;top:0', 'left:0;bottom:0', 'right:0;bottom:0'].map((c, i) => {
  const side = Object.fromEntries(c.split(';').map((p) => [p.split(':')[0], 0]));
  const bw = Object.fromEntries(Object.keys(side).map((s) => [`border${s[0].toUpperCase()}${s.slice(1)}`, `${0.8 * U}px solid ${GOLD}`]));
  return <i key={i} style={abs({ ...side, width: 4 * U, height: 4 * U, ...bw })} />;
});
// a copy of the frozen frame with canvas point (px,py) magnified m times at container point (X,Y)
const Magnified = ({ video, px, py, m, X, Y }) => (
  <div style={abs({ left: X - px, top: Y - py, width: CANVAS_W, height: CANVAS_H, transformOrigin: `${px}px ${py}px`, transform: `scale(${m})` })}>{video}</div>
);
const FreezeBorder = ({ o, T }) => (<>
  <AbsoluteFill style={{ border: `${1.6 * U}px solid #FFFFFF`, opacity: o }} />
  <div style={abs({ right: 6 * U, top: T.g.top + 3 * U, opacity: o, font: `700 ${7 * U}px/1 Oswald, Arial, sans-serif`, color: '#FFFFFF' })}>❚❚</div>
</>);
const Flash = ({ o }) => (o > 0 ? <AbsoluteFill style={{ background: '#FFFFFF', opacity: o }} /> : null);
const tagAt = (T) => [T.x + 0.009 * T.g.dw, T.y - 0.072 * T.g.dw];
const wx = (T, p) => T.g.left + (p / 100) * T.g.dw, wy = (T, p) => T.g.top + (p / 100) * T.g.dh;

const HOOKS = {
  'H1+': {   // Spotlight Mark
    end: 0.7, sfx: 'whoosh_slide@0-7|pop_light@10',
    cam: (t) => ({ s: k(t, [[0, 1.28], [100, 1.48]], LIN) }),
    world: (t, T) => {
      const r = k(t, [[0, 100], [7, -300]], EZ_OUT), a = k(t, [[0, 0], [7, 0.6]], EZ_OUT), [lx, ly] = tagAt(T);
      return (<>
        <Zone T={T} style={{ border: `${0.7 * U}px solid ${ORANGE}`, boxShadow: `0 0 0 ${200 * U}px rgba(12,14,22,${a})`, clipPath: `inset(-300% ${r}% -300% -300%)` }} />
        <Tag text={T.text} x={lx} y={ly} style={{ opacity: k(t, [[6, 0], [10, 1]]), transform: `translateY(${k(t, [[6, U], [10, 0]])}px)` }} />
      </>);
    },
  },
  H1b: {   // Ink Circle
    end: 1.68, sfx: 'draw_pen@2-16|pop_light@21~0.5',
    cam: (t) => ({ s: k(t, [[0, 1.25], [100, 1.42]], LIN) }),
    world: (t, T) => {
      const rx = (T.w * 34) / 58, ry = (T.h * 8.5) / 8.3;
      return (<>
        <WorldFill T={T} style={{ opacity: k(t, [[0, 0], [10, 1]]),
          background: `radial-gradient(ellipse ${rx * 37 / 34}px ${ry * 12 / 8.5}px at ${T.cx - T.g.left}px ${T.cy - T.g.top}px, rgba(12,14,22,0) 92%, rgba(12,14,22,.58) 100%)` }} />
        <svg width={CANVAS_W} height={CANVAS_H} style={abs({ left: 0, top: 0, overflow: 'visible' })}>
          <ellipse cx={T.cx} cy={T.cy} rx={rx} ry={ry} transform={`rotate(-3 ${T.cx} ${T.cy})`} pathLength={100} fill="none" stroke={ORANGE}
            strokeWidth={0.011 * T.g.dw} strokeLinecap="round" strokeDasharray={100} strokeDashoffset={k(t, [[2, 100], [16, 0]], EZ_IO)} />
        </svg>
        <Tag text={T.text} x={T.cx - 0.16 * T.g.dw} y={T.cy - ry - 0.065 * T.g.dw}
          style={{ opacity: k(t, [[18, 0], [21, 1]]), transform: `scale(${k(t, [[18, 0.6], [21, 1.1], [24, 1]])})` }} />
      </>);
    },
  },
  H8: {   // Magnifier
    end: 3.5, sfx: 'whoosh_slide@0-20|whoosh_slide@20-36|click_soft@36|pop_medium@50',
    world: (t, T, video) => {
      const D = 0.36 * T.g.dw, m = 2.2;
      // a line's origin sits a third into the lens view so the line runs across it; the lens stays on the chart
      const fx = Math.max(T.g.left + D / 2 + U, Math.min(T.g.left + T.g.dw - D / 2 - U, T.fx + (T.line ? D / m / 6 : 0)));
      const cx = k(t, [[0, wx(T, 20)], [20, wx(T, 45)], [36, fx]], EZ_IO), cy = k(t, [[0, wy(T, 60)], [20, wy(T, 40)], [36, T.fy]], EZ_IO);
      const mh = Math.min(0.6 * D, Math.max(0.15 * D, T.h * m)), mp = k(t, [[38, 0], [46, 1]], EZ_OUT);
      return (<>
        <WorldFill T={T} style={{ background: 'rgba(12,14,22,.45)' }} />
        <div style={abs({ left: cx - D / 2 - U, top: cy - D / 2 - U, width: D, height: D, borderRadius: '50%', overflow: 'hidden',
          border: `${U}px solid ${GOLD}`, boxShadow: `0 ${1.5 * U}px ${5 * U}px rgba(0,0,0,.6)` })}>
          <Magnified video={video} px={cx} py={cy} m={m} X={D / 2} Y={D / 2} />
          <div style={abs({ left: 0.04 * D, width: 0.92 * D, top: (D - mh) / 2, height: mh, boxSizing: 'border-box', border: `${0.8 * U}px solid ${ORANGE}`,
            borderRadius: U, opacity: mp, transform: `scaleX(${mp})` })} />
        </div>
        <Tag text={T.text} x={fx - 0.16 * T.g.dw} y={T.fy + D / 2 + U + 0.02 * T.g.dw + 6 * U < T.g.top + T.g.dh
          ? T.fy + D / 2 + U + 0.02 * T.g.dw : T.fy - D / 2 - U - 0.02 * T.g.dw - 5.2 * U}
          style={{ opacity: k(t, [[44, 0], [50, 1]]), transform: `translateY(${k(t, [[44, -2 * U], [50, 0]])}px)` }} />
      </>);
    },
  },
  H8b: {   // Lift-Out
    end: 1.89, sfx: 'whoosh_slide@10-20|pop_medium@20',
    world: (t, T, video) => {
      const s = Math.min(1.5, (0.94 * CANVAS_W) / T.w), dy = CANVAS_H * 0.41 - T.cy;
      const ty = k(t, [[10, 0], [20, dy]]), sc = k(t, [[10, 1], [20, s * 1.053], [23, s]]), sh = k(t, [[10, 0], [23, 0.7]]);
      return (<>
        <WorldFill T={T} style={{ background: 'rgba(12,14,22,.45)', opacity: k(t, [[10, 0], [18, 1]]) }} />
        <div style={abs({ left: T.x - 0.6 * U, top: T.y - 0.6 * U, width: T.w, height: T.h, overflow: 'hidden', borderRadius: U, border: `${0.6 * U}px solid ${GOLD}`,
          transform: `translateY(${ty}px) scale(${sc})`, boxShadow: `0 ${2.5 * U}px ${6 * U}px rgba(0,0,0,${sh})` })}>
          <div style={abs({ left: -T.x, top: -T.y, width: CANVAS_W, height: CANVAS_H })}>{video}</div>
        </div>
        <Tag text={T.text} x={T.cx - 0.15 * T.g.dw} y={T.cy + dy + (T.h * s) / 2 + 0.04 * T.g.dw}
          style={{ opacity: k(t, [[22, 0], [27, 1]]), transform: `translateY(${k(t, [[22, -2 * U], [27, 0]])}px)` }} />
      </>);
    },
  },
  H8c: {   // Zoom Inset: the close-up panel opens below the zone (above it when the zone is low)
    end: 1.75, sfx: 'click_soft@7|whoosh_fast@8-20',
    world: (t, T) => (<>
      <WorldFill T={T} style={{ background: 'rgba(12,14,22,.35)', opacity: k(t, [[10, 0], [16, 1]]) }} />
      <Zone T={T} style={{ border: `${0.5 * U}px solid ${GOLD}`, opacity: k(t, [[4, 0], [7, 1]]), transform: `scale(${k(t, [[4, 1.2], [7, 1]])})` }} />
    </>),
    screen: (t, T, video) => {
      const W = 88 * U, H = 34 * U, B = 0.8 * U, below = T.cy < CANVAS_H * 0.55;
      const top = Math.max(200, Math.min(CANVAS_H - 480 - H, below ? T.y + T.h + 33 * U : T.y - 33 * U - H));
      const m = Math.min(1.45, (W - 2 * B - 2.3 * U) / T.w), iw = W - 2 * B, ih = H - 2 * B, cut = k(t, [[12, 100], [20, 0]]);
      const [ey, iy] = below ? [T.y + T.h, top] : [T.y, top + H], off = k(t, [[8, 100], [14, 0]]);
      return (<>
        <svg width={CANVAS_W} height={CANVAS_H} style={abs({ left: 0, top: 0 })}>
          {[[T.x, 6 * U], [T.x + T.w, 94 * U]].map(([x1, x2], i) => (
            <line key={i} x1={x1} y1={ey} x2={x2} y2={iy} pathLength={100} stroke={GOLD} strokeWidth={0.5 * U} strokeDasharray={100} strokeDashoffset={off} />))}
        </svg>
        <div style={abs({ left: 6 * U, top, width: W, height: H, boxSizing: 'border-box', overflow: 'hidden', border: `${B}px solid ${GOLD}`, borderRadius: 2 * U,
          background: '#3A373E', boxShadow: `0 ${1.5 * U}px ${5 * U}px rgba(0,0,0,.6)`, clipPath: below ? `inset(0 0 ${cut}% 0)` : `inset(${cut}% 0 0 0)` })}>
          <Magnified video={video} px={T.cx} py={T.cy} m={m} X={iw / 2} Y={ih / 2} />
          <div style={abs({ left: (iw - T.w * m) / 2, top: (ih - T.h * m) / 2, width: T.w * m, height: T.h * m, boxSizing: 'border-box',
            border: `${0.6 * U}px solid ${ORANGE}`, borderRadius: U, opacity: k(t, [[21, 0], [25, 1]]) })} />
        </div>
      </>);
    },
  },
  H11: {   // Freeze Punch
    end: 1.82, sfx: 'whoosh_fast@18-20|impact_deep@20~1.4',
    cam: (t) => ({ s: k(t, [[0, 1], [18, 1.05], [20, 1.6], [21, 1.62], [22, 1.6]]), x: k(t, [[0, 3], [18, -2], [20, 0], [21, 1], [22, -1], [23, 0]]), y: k(t, [[20, 0], [21, 1], [22, 0]]) }),
    world: (t, T) => <Zone T={T} style={{ border: `${0.5 * U}px solid ${ORANGE}`, background: 'rgba(255,122,69,.2)', opacity: k(t, [[20, 0], [24, 1]]) }} />,
    screen: (t, T) => (<><FreezeBorder T={T} o={k(t, [[19, 0], [21, 1]])} /><Flash o={k(t, [[19, 0], [20, 0.9], [26, 0]])} /></>),
  },
  H11b: {   // Double Punch
    end: 2.59, sfx: 'impact_hit@12|impact_deep@32~1.3',
    cam: (t) => ({
      s: k(t, [[0, 1], [11.5, 1.03], [12, 1.35], [13, 1.37], [14, 1.35], [15, 1.37], [31.5, 1.37], [32, 1.85], [33, 1.87], [34, 1.85], [35, 1.88]]),
      x: k(t, [[12, 0], [13, 1], [14, -0.8], [15, 0], [32, 0], [33, 1], [34, -1], [35, 0]]), y: k(t, [[12, 0], [13, 0.6], [14, 0], [32, 0], [33, 1], [34, 0]]),
    }),
    world: (t, T) => <Zone T={T} style={{ border: `${0.5 * U}px solid ${ORANGE}`, background: 'rgba(255,122,69,.2)', opacity: k(t, [[32, 0], [35, 1]]) }} />,
    screen: (t) => <Flash o={k(t, [[11.5, 0], [12, 0.55], [16, 0], [31.5, 0], [32, 0.85], [37, 0]])} />,
  },
  H11c: {   // Shockwave Freeze (no zoom: the whole chart stays in view)
    end: 2.94, sfx: 'whoosh_deep@0-25|impact_deep@25~1.6',
    cam: (t) => ({ s: 1.2, x: k(t, [[0, 7], [25, 0]], Easing.bezier(0.1, 0.6, 0.2, 1)) }),
    world: (t, T) => (<>
      <div style={abs({ left: T.fx - 0.05 * T.g.dw - U, top: T.fy - 0.05 * T.g.dw - U, width: 0.1 * T.g.dw, height: 0.1 * T.g.dw, borderRadius: '50%',
        border: `${U}px solid ${GOLD}`, opacity: k(t, [[25, 0], [26, 1], [42, 0]], EZ_OUT), transform: `scale(${k(t, [[25, 0.2], [42, 7]], EZ_OUT)})` })} />
      <Zone T={T} style={{ border: `${0.6 * U}px solid ${ORANGE}`, background: 'rgba(255,122,69,.22)', opacity: k(t, [[26, 0], [30, 1]]) }} />
    </>),
    screen: (t, T) => <FreezeBorder T={T} o={k(t, [[24.5, 0], [25, 1]])} />,
  },
  H15: {   // Lock-On
    end: 2.8, sfx: 'whoosh_slide@0-10|whoosh_slide@10-20|click_soft@32|glass_ding@34',
    cam: (t) => ({ s: k(t, [[30, 1.1], [40, 1.35]]) }),
    world: (t, T) => {
      const { dw, dh } = T.g, e = EZ_IO;
      const L = k(t, [[0, wx(T, 4)], [10, wx(T, 40)], [20, wx(T, 15)], [32, T.x]], e), Tp = k(t, [[0, wy(T, 4)], [10, wy(T, 40)], [20, wy(T, 8)], [32, T.y]], e);
      const W = k(t, [[0, 0.92 * dw], [10, 0.3 * dw], [20, 0.5 * dw], [32, T.w]], e), H = k(t, [[0, 0.92 * dh], [10, 0.3 * dh], [20, 0.3 * dh], [32, T.h]], e);
      const line = `${0.3 * U}px solid rgba(255,214,107,.5)`;
      return (<>
        <Zone T={T} style={{ background: 'rgba(255,214,107,.22)', opacity: k(t, [[32, 0], [36, 1]]) }} />
        <div style={abs({ left: L, top: Tp, width: W, height: H })}>
          <Brackets />
          <span style={abs({ left: '-200%', right: '-200%', top: '50%', borderTop: line })} />
          <span style={abs({ top: '-500%', bottom: '-500%', left: '50%', borderLeft: line })} />
          <Locked o={k(t, [[31, 0], [34, 1]])} s={k(t, [[31, 0.6], [34, 1.15], [37, 1]])} />
        </div>
      </>);
    },
  },
  H15b: {   // Radar Blip
    end: 3.57, sfx: 'click_soft@20|rise_tone@40|click_soft@46|glass_ding@48',
    cam: (t) => ({ s: k(t, [[40, 1.05], [50, 1.3]]) }),
    world: (t, T) => {
      const { dw } = T.g, d = 0.034 * dw;
      const lk = (a, b, c) => k(t, [[39, a], [40, b], [46, c]]);
      return (<>
        <WorldFill T={T} style={{ background: 'rgba(12,14,22,.4)', opacity: k(t, [[42, 1], [50, 0.35]]) }} />
        <WorldFill T={T} style={{ borderRadius: '50%', opacity: k(t, [[40, 1], [46, 0]]),
          background: 'repeating-radial-gradient(circle, rgba(255,214,107,0) 0 11.4%, rgba(255,214,107,.22) 11.6% 12%)' }} />
        <WorldFill T={T} style={{ borderRadius: '50%', opacity: k(t, [[40, 1], [44, 0]]), transform: `rotate(${k(t, [[0, 0], [40, 720]], LIN)}deg)`,
          background: 'conic-gradient(from 0deg, rgba(255,214,107,0) 0deg 290deg, rgba(255,214,107,.5) 358deg, rgba(255,214,107,0) 360deg)' }} />
        <div style={abs({ left: T.fx - d / 2, top: T.fy - d / 2, width: d, height: d, borderRadius: '50%', background: GOLD, boxShadow: `0 0 ${3 * U}px ${U}px rgba(255,214,107,.7)`,
          opacity: k(t, [[19, 0], [20, 1], [28, 0.25], [38, 0.25], [40, 1], [45, 0]]), transform: `scale(${k(t, [[19, 0.4], [20, 1.4], [28, 1], [38, 1], [40, 1.6]])})` })} />
        <Zone T={T} style={{ background: 'rgba(255,214,107,.22)', opacity: k(t, [[46, 0], [50, 1]]) }} />
        <div style={abs({ left: lk(T.fx - 0.05 * dw, T.fx - 0.08 * dw, T.x), top: lk(T.fy - 0.05 * dw, T.fy - 0.08 * dw, T.y),
          width: lk(0.1 * dw, 0.16 * dw, T.w), height: lk(0.1 * dw, 0.16 * dw, T.h), opacity: k(t, [[39, 0], [40, 1]]) })}>
          <Brackets />
          <Locked o={k(t, [[45, 0], [48, 1]])} s={k(t, [[45, 0.6], [48, 1.15], [51, 1]])} />
        </div>
      </>);
    },
  },
  H6r: {   // Search & Tick (H6 changed: no blur, a circle searches, tick, then the mark)
    end: 5.11, sfx: 'whoosh_slide@0-14|whoosh_slide@28-42|click_soft@56|glass_ding@63|draw_pen@64-70',
    cam: (t) => ({ s: k(t, [[0, 1.1], [100, 1.28]], LIN) }),
    world: (t, T) => {
      const { dw } = T.g, D = 0.12 * dw, [lx, ly] = tagAt(T);
      const cx = k(t, [[0, wx(T, 12)], [14, wx(T, 36)], [28, wx(T, 54)], [42, wx(T, 70)], [56, T.fx]], EZ_IO);
      const cy = k(t, [[0, wy(T, 66)], [14, wy(T, 72)], [28, wy(T, 44)], [42, wy(T, 56)], [56, T.fy]], EZ_IO);
      const tick = [[-0.055, 0], [-0.015, 0.04], [0.06, -0.085]].map(([a, b]) => `${T.fx + a * dw},${T.fy + b * dw}`).join(' ');
      return (<>
        <Zone T={T} style={{ border: `${0.7 * U}px solid ${ORANGE}`, background: 'rgba(255,122,69,.2)', clipPath: `inset(0 ${k(t, [[64, 100], [70, 0]])}% 0 0)` }} />
        <Tag text={T.text} x={lx} y={ly} style={{ opacity: k(t, [[69, 0], [73, 1]]), transform: `translateY(${k(t, [[69, U], [73, 0]])}px)` }} />
        <div style={abs({ left: cx - D / 2 - 0.7 * U, top: cy - D / 2 - 0.7 * U, width: D, height: D, borderRadius: '50%', border: `${0.7 * U}px solid ${GOLD}`,
          boxShadow: `0 0 0 ${0.4 * U}px rgba(12,14,22,.35)`, opacity: k(t, [[56, 1], [62, 0]]), transform: `scale(${k(t, [[56, 1], [59, 0.85], [62, 1.3]])})` })} />
        <svg width={CANVAS_W} height={CANVAS_H} style={abs({ left: 0, top: 0, overflow: 'visible' })}>
          <polyline points={tick} pathLength={100} fill="none" stroke="#3CD68A" strokeWidth={0.016 * dw} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={100} strokeDashoffset={k(t, [[58, 100], [63, 0]])} opacity={k(t, [[86, 1], [92, 0]])} />
        </svg>
      </>);
    },
  },
  H22: {   // Arrow Strike: the tip lands on the zone's left edge
    end: 1.26, sfx: 'whoosh_fast@0-9|impact_hit@9',
    cam: (t) => ({ s: k(t, [[8.8, 1.25], [9.5, 1.27], [10.5, 1.25], [12, 1.26], [100, 1.4]]), x: k(t, [[8.8, 0], [9.5, 0.8], [10.5, -0.6], [12, 0]]), y: k(t, [[8.8, 0], [9.5, 0.6], [10.5, 0]]) }),
    world: (t, T) => {
      const { dw } = T.g, fly = Easing.bezier(0.5, 0, 0.9, 0.6);
      const tx = k(t, [[0, -80 * U], [9, 0]], fly), ty = k(t, [[0, 50 * U], [9, 0]], fly);
      const rot = k(t, [[9, -28], [10.5, -23], [12, -31], [13.5, -26.5], [15, -28]], EZ_OUT);
      return (<>
        <Zone T={T} style={{ border: `${0.7 * U}px solid ${ORANGE}`, opacity: k(t, [[8.8, 0], [9.2, 1]]), background: `rgba(255,122,69,${k(t, [[8.8, 0], [9.2, 0.6], [18, 0.18]])})` }} />
        <Tag text={T.text} x={T.x + 0.209 * dw} y={T.y - 0.072 * dw} style={{ opacity: k(t, [[11, 0], [15, 1]]), transform: `translateY(${k(t, [[11, U], [15, 0]])}px)` }} />
        <div style={abs({ left: T.x - 0.34 * dw, top: T.cy - 0.025 * dw, width: 0.34 * dw, height: 0.05 * dw, transformOrigin: '100% 50%',
          transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)` })}>
          <svg viewBox="0 0 100 14" preserveAspectRatio="none" style={abs({ inset: 0, width: '100%', height: '100%', overflow: 'visible', filter: `drop-shadow(0 ${0.8 * U}px ${U}px rgba(0,0,0,.6))` })}>
            <line x1="10" y1="7" x2="88" y2="7" stroke={GOLD} strokeWidth="2.6" />
            <polygon points="86,0.5 100,7 86,13.5" fill={GOLD} />
            <polygon points="0,1 12,7 0,13 5,7" fill={ORANGE} />
          </svg>
        </div>
      </>);
    },
  },
  H23: {   // Tap Reveal
    end: 2.24, sfx: 'whoosh_slide@0-15|click_soft@16.5|pop_light@20~0.5',
    cam: (t) => ({ s: k(t, [[18, 1.1], [32, 1.32]]) }),
    world: (t, T) => {
      const { dw } = T.g, D = 0.11 * dw, R = 0.08 * dw, [lx, ly] = tagAt(T);
      const cx = k(t, [[0, wx(T, 77.5)], [15, T.fx]], EZ_IO), cy = k(t, [[0, wy(T, 79.5)], [15, T.fy]], EZ_IO);
      return (<>
        <div style={abs({ left: T.fx - R / 2 - 0.6 * U, top: T.fy - R / 2 - 0.6 * U, width: R, height: R, borderRadius: '50%', border: `${0.6 * U}px solid ${GOLD}`,
          opacity: k(t, [[16.5, 0], [17, 1], [27, 0]]), transform: `scale(${k(t, [[16.5, 0.3], [27, 3.4]])})` })} />
        <Zone T={T} style={{ border: `${0.7 * U}px solid ${ORANGE}`, background: 'rgba(255,122,69,.24)', opacity: k(t, [[17.5, 0], [20, 1]]), transform: `scale(${k(t, [[17.5, 0.9], [20, 1]])})` }} />
        <Tag text={T.text} x={lx} y={ly} style={{ opacity: k(t, [[19, 0], [22, 1]]), transform: `scale(${k(t, [[19, 0.6], [22, 1]])})` }} />
        <div style={abs({ left: cx - D / 2, top: cy - D / 2, width: D, height: D, borderRadius: '50%', boxSizing: 'border-box', background: 'rgba(255,255,255,.3)',
          border: `${0.5 * U}px solid rgba(255,255,255,.9)`, boxShadow: `0 ${0.6 * U}px ${2 * U}px rgba(0,0,0,.5)`,
          opacity: k(t, [[18, 1], [24, 0]]), transform: `scale(${k(t, [[15, 1], [16.5, 0.72], [18, 1]])})` })} />
      </>);
    },
  },
};

// the hook's camera wraps the frozen frame + world-space marks; screen-space parts (flash, freeze border, inset) sit on top
function HookV4({ id, T, t, video }) {
  const H = HOOKS[id], c = H.cam ? H.cam(t, T) : { s: 1 };
  // zoom about the zone centre, shifted only as far as needed to keep the focus (a line's origin) 5% inside the frame
  const fit = (o, f, W) => (c.s > 1.001 ? Math.min((c.s * f - 0.05 * W) / (c.s - 1), Math.max((c.s * f - 0.95 * W) / (c.s - 1), o)) : o);
  const ox = fit(T.cx, T.fx, CANVAS_W), oy = fit(T.cy, T.fy, CANVAS_H);
  return (<>
    <AbsoluteFill style={{ transformOrigin: `${ox}px ${oy}px`,
      transform: `scale(${c.s.toFixed(4)}) translate(${(((c.x || 0) * T.g.dw) / 100).toFixed(1)}px, ${(((c.y || 0) * T.g.dh) / 100).toFixed(1)}px)` }}>
      {video}
      {H.world(t, T, video)}
    </AbsoluteFill>
    {H.screen && H.screen(t, T, video)}
  </>);
}

// SFX follow the MOVEMENT (Owner 2026-09-29), in the same keyframe % as the motion above:
//   'file@a-b' = movement sound: audible from the frame the movement starts (a%) and cut when it ends (b%)
//   'file@a~tail' = landing sound: its loudest point lands on the frame the thing lands (a%), then rings for tail s
// Each file starts with silence, so it is shifted by its measured onset/attack (s, 2026-09-29): movement = first
// sample over -40 dB; landing = first sample at 70% of the max (impact_deep's max sits 0.3 s into its sustain, its hit
// is at 0.055; click_soft is a double click, the main one lands); rise_tone = its climax, so the build peaks on the payoff.
const SFX_AT = {
  whoosh_slide: 0.108, whoosh_fast: 0.180, whoosh_deep: 0.106, draw_pen: 0.046,                        // onset
  click_soft: 0.202, glass_ding: 0.095, impact_hit: 0.193, impact_deep: 0.055, pop_light: 0.074, pop_medium: 0.205, rise_tone: 1.525,   // attack
};
const SFX_MIN_S = 0.3, SFX_FADE = 4;   // a cut sound plays at least 0.3 s and fades out over its last 4 frames
function sfxCues(cues, scale) {
  return cues.split('|').map((c) => {
    const [file, rest] = c.split('@'), [span, tail] = rest.split('~'), [a, b] = span.split('-').map(Number);
    const at = a * 0.07 * scale, lead = SFX_AT[file] || 0;
    const len = b != null ? Math.max(SFX_MIN_S, (b - a) * 0.07 * scale) : tail ? Number(tail) : null;
    return { file, start: at - lead, end: len != null ? at + len : null };   // file time 0 plays at `start` (may be < 0)
  });
}
function HookSfx({ cues, scale, fps }) {
  return sfxCues(cues, scale).map(({ file, start, end }, i) => {
    const from = Math.max(0, Math.round(start * fps)), trim = Math.max(0, Math.round(-start * fps));
    const dur = end != null ? Math.max(1, Math.round(end * fps) - from) : undefined;
    const vol = dur ? (f) => SFX_VOLUME * clamp01((dur - f) / SFX_FADE) : SFX_VOLUME;
    return (
      <Sequence key={i} from={from} durationInFrames={dur} layout="none">
        <Audio src={staticFile(`assets/sfx/${file}.mp3`)} startFrom={trim} volume={vol} />
      </Sequence>
    );
  });
}


// ── FreezeSegment ──────────────────────────────────────────────────────────────
// Video frozen on seg.timestamp for the full segment duration.
// Voiceover audio plays from frame 0 of this Sequence.
// Talking captions: words pop into a speech bubble as they are spoken.
// CTA banner fades in if show_cta is true.
//
// KEY: <Freeze frame={N}> makes ALL its children behave as if the current
// Remotion frame is N. OffthreadVideo inside Freeze renders at time N/fps.
// Audio and captions are OUTSIDE Freeze so they advance normally.
function FreezeSegment({ seg, srcUrl, ctaUrl, fps, brand, sourceW, sourceH, layout, prevFx, whipOut }) {
  // V0.1 Chart Marks: a solved pause freezes on the solver's proving frame (may differ from the pause timestamp).
  const chart = seg.chart && seg.chart.marks && seg.chart.marks.length ? seg.chart : null;
  const frozenVideoFrame = Math.round((chart ? chart.frame_ms / 1000 : seg.timestamp) * fps);
  // Called outside the Sequence → absolute frame; make it segment-relative.
  const t     = (useCurrentFrame() - seg.frameStart) / fps;
  const promo = productPopupState(t, productWindow(seg.captions, seg.duration));
  // Hook Pool v4: the hook owns the camera and draws its own zone; no usable mark -> H0 push-in
  const hookId = HOOK_ALIAS[seg.hook_visual] || seg.hook_visual;
  const hookV4 = seg.hook_visual && HOOKS[hookId];
  const hookT  = hookV4 ? hookTarget(chart, sourceW, sourceH) : null;
  const hookK  = hookT ? Math.min(1, (seg.duration - 0.4) / hookV4.end) : 1;   // a short pause runs the hook faster
  const frozen = (
    <Freeze frame={frozenVideoFrame}>
      <AbsoluteFill>
        <OffthreadVideo src={srcUrl} volume={0} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </AbsoluteFill>
    </Freeze>
  );

  // Retention effects on the frozen frame (the pop-up's own blur is kept as-is).
  const filters = [];
  if (promo.blur > 0) filters.push(`blur(${(promo.blur * POPUP_BLUR_PX).toFixed(1)}px)`);
  if (seg.fx === 'recap' && seg.fx_cards?.length && recapFocus(t) > 0) filters.push(`blur(${(recapFocus(t) * RECAP_BLUR_PX).toFixed(1)}px)`);
  if (seg.fx === 'pause_signal' && t < 0.8) filters.push(`grayscale(${(1 - clamp01((t - 0.1) / 0.7)).toFixed(2)})`);
  const wOut = whipOut ? Math.max(0, 1 - (seg.duration - t) / FX_WHIP) : 0;   // slide out left, last 0.3 s
  if (wOut > 0) filters.push(`blur(${(wOut ** 3 * 24).toFixed(1)}px)`);
  const flashA = seg.fx === 'pause_signal' ? 0.8 - t * 6 : prevFx === 'flash' ? 0.7 - t * 4 : 0;
  const videoStyle = {
    ...(filters.length ? { filter: filters.join(' ') } : {}),
    ...(wOut > 0 ? { transform: `translateX(${(-(wOut ** 3) * CANVAS_W).toFixed(0)}px)` } : {}),
  };

  return (
    <Sequence from={seg.frameStart} durationInFrames={seg.frameCount}>

      {/* ── FROZEN VIDEO FRAME (blurs while the product card is up) ───────── */}
      <AbsoluteFill style={filters.length || wOut > 0 ? videoStyle : undefined}>
        {hookT ? <HookV4 id={hookId} T={hookT} t={t / hookK} video={frozen} /> : (
          <ChartZoom chart={hookV4 ? null : chart} sw={sourceW} sh={sourceH} t={t} push={seg.hook_visual ? seg.duration : 0}>
            {frozen}
            {chart && !hookV4 && <ChartMarks chart={chart} sw={sourceW} sh={sourceH} tMs={t * 1000} />}
          </ChartZoom>
        )}
      </AbsoluteFill>
      {hookT && <HookSfx cues={hookV4.sfx} scale={hookK} fps={fps} />}

      {/* ── RETENTION EFFECTS (beneath the pop-up and captions) ───────────── */}
      <WhiteFlash a={flashA} />
      {seg.fx === 'recap' && seg.fx_cards?.length > 0 && (
        <RecapCards cards={seg.fx_cards} t={t} srcUrl={srcUrl} fps={fps} layout={layout} />
      )}
      {seg.fx === 'pause_signal' && (
        <FxChip text="❚❚ PAUSE" x={CANVAS_W - 190} y={layout.chipY} size={40} light brand={brand} t={t - 0.1} fps={fps} out={1.5} />
      )}
      {seg.fx === 'hook_stamp' && (
        <FxChip text={seg.fx_text} x={CANVAS_W / 2} y={layout.labelY} size={54} bg="#C0392B" brand={brand} t={t - 0.2} fps={fps} />
      )}
      {seg.hook_visual && seg.fx_text && (
        <HookHeadline text={seg.fx_text} question={seg.hook_visual === 'H3'} t={t} fps={fps} layout={layout} brand={brand} />
      )}
      {seg.fx === 'key_term' && (
        <FxChip text={seg.fx_text} x={CANVAS_W / 2} y={layout.labelY} size={50} brand={brand} t={t - (seg.fx_at || 0)} fps={fps} out={3.5} />
      )}

      {/* ── PRODUCT POP-UP ────────────────────────────────────────────────── */}
      {/* Above the video, BELOW the captions — must never hide them.         */}
      {promo.blur > 0 && <ProductPopup state={promo} />}

      {/* ── VOICEOVER AUDIO ───────────────────────────────────────────────── */}
      {/* Outside Freeze — advances from frame 0 of this Sequence.            */}
      {seg.audio_url && (
        <Audio src={seg.audio_url} />
      )}

      {/* ── TALKING CAPTIONS ─────────────────────────────────────────────── */}
      {/* Astronaut avatar + speech bubble pinned to bottom of canvas.         */}
      {seg.captions && seg.captions.length > 0 && (
        <TalkingCaptions
          captions={seg.captions}
          fps={fps}
          brand={brand}
          side={seg.side}
          goldWords={seg.fx === 'gold_words' ? seg.fx_words : null}
        />
      )}

      {/* ── CTA BANNER ───────────────────────────────────────────────────── */}
      {seg.show_cta && ctaUrl && (
        <CTABanner bannerUrl={ctaUrl} />
      )}

    </Sequence>
  );
}


// ── LessonTitle ───────────────────────────────────────────────────────────────
// Lesson title pinned to the top of the canvas for the full composition.
// Dark semi-transparent pill background ensures readability on any surface:
// white letterbox space, chart content, or full-bleed portrait video.
function LessonTitle({ title, brand, from = 0 }) {
  const fontFamily  = brand.font_heading || 'Oswald';
  const accentColor = brand.accent       || '#C9A84C';
  const a = clamp01((useCurrentFrame() - from) / 8);
  if (a <= 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: a }}>
      <div
        style={{
          position:       'absolute',
          top:            TITLE_TOP,
          left:           60,
          right:          60,
          display:        'flex',
          justifyContent: 'center',
        }}
      >
        {/* Dark pill — readable on white space, chart, or portrait video */}
        <div
          style={{
            background:    'rgba(0, 0, 0, 0.62)',
            borderRadius:  20,
            padding:       '22px 44px',
            maxWidth:      '100%',
            fontFamily:    `${fontFamily}, Arial, sans-serif`,
            fontSize:      48,
            fontWeight:    700,
            color:         accentColor,
            textAlign:     'center',
            textTransform: 'uppercase',
            letterSpacing: 2,
            lineHeight:    1.2,
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
}


// ── TalkingCaptions ──────────────────────────────────────────────────────────
// "Talking astronaut": round PipsGravity avatar + comic speech bubble.
// Words pop in one by one as spoken (no karaoke highlight). Owner-approved look
// (maint doc MAINT-2026-09-14 Session 5).
//
// Lines: the bubble is a FIXED size (always 2 text lines tall, Owner 2026-09-14);
//   only the words change. A line holds max 6 words and max LINE_CHARS characters
//   so it always fits in 2 lines. Sentence ends always break; commas once >=3 words.
// Side: fixed for the whole freeze segment (pause), alternating per pause —
//   passed in by RepurposeScene. The avatar pops once; the bubble re-pops per line.
// Future words are invisible but keep their layout, so the line never reflows.
const AVATAR = 240;
const INK    = '#13213A';
const FONT_PX = 58;
// ponytail: character budget stands in for text measuring (~17 chars per line at
// 58px Inter 800 in a 614px text box). Swap for @remotion/layout-utils fitText if
// long words ever clip.
const LINE_CHARS = 28;

// back-out overshoot, 0→1 with a small bounce past 1
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const pop = (p) => { p = clamp01(p); const k = 1.9; return 1 + (k + 1) * (p - 1) ** 3 + k * (p - 1) ** 2; };

function TalkingCaptions({ captions, fps, brand, side, goldWords }) {
  const frame      = useCurrentFrame();
  const currentSec = frame / fps;
  const fontFamily = brand.font_body    || 'Inter';
  const nameFont   = brand.font_heading || 'Oswald';
  const gold       = brand.accent       || '#C9A84C';
  const right      = side === 'right';

  const chunks = [];
  let current  = [];
  captions.forEach((cap) => {
    const chars = current.reduce((n, c) => n + c.word.length + 1, cap.word.length);
    if (current.length > 0 && (current.length >= 6 || chars > LINE_CHARS)) {
      chunks.push(current);
      current = [];
    }
    current.push(cap);
    if (/[.!?]$/.test(cap.word) || (/[,;]$/.test(cap.word) && current.length >= 3)) {
      chunks.push(current);
      current = [];
    }
  });
  if (current.length > 0) chunks.push(current);

  if (currentSec < captions[0].start) return null;

  let activeIdx = 0;
  chunks.forEach((chunk, idx) => { if (currentSec >= chunk[0].start) activeIdx = idx; });
  const line = chunks[activeIdx];

  const sinceFirst = (currentSec - captions[0].start) * fps;       // avatar clock
  const sinceLine  = (currentSec - line[0].start) * fps;           // bubble clock
  const bubbleF    = activeIdx === 0 ? sinceLine - 3 : sinceLine;  // first bubble waits for the avatar

  // avatar bobs up on each spoken word
  let bob = 0;
  line.forEach((c) => { const d = (currentSec - c.start) * fps; if (d >= 0 && d < 5) bob = Math.max(bob, 1 - d / 5); });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:      'absolute',
          left:          48,
          right:         48,
          bottom:        CAPTION_BOTTOM,
          display:       'flex',
          flexDirection: right ? 'row-reverse' : 'row',
          alignItems:    'flex-end',
          gap:           26,
        }}
      >
        <Img
          src={staticFile('assets/avatar/profile_picture.jpg')}
          style={{
            flex:         'none',
            width:        AVATAR,
            height:       AVATAR,
            borderRadius: '50%',
            background:   '#FFFFFF',
            border:       `8px solid ${gold}`,
            boxShadow:    `0 0 0 6px ${INK}, 0 12px 30px rgba(0,0,0,.35)`,
            transform:    `scale(${pop(sinceFirst / 9)}) translateY(${-10 * bob}px)`,
          }}
        />
        <div
          style={{
            position:        'relative',
            flex:            1,
            background:      '#FFFFFF',
            border:          `6px solid ${INK}`,
            borderRadius:    44,
            padding:         '44px 46px 40px',
            boxShadow:       '0 12px 30px rgba(0,0,0,.28)',
            opacity:         clamp01(bubbleF / 4),
            transform:       `scale(${0.4 + 0.6 * pop(bubbleF / 9)})`,
            transformOrigin: right ? '100% 100%' : '0 100%',
          }}
        >
          {/* tail pointing at the avatar */}
          <div
            style={{
              position:     'absolute',
              bottom:       34,
              [right ? 'right' : 'left']: -30,
              width:        44,
              height:       44,
              background:   '#FFFFFF',
              borderBottom: `6px solid ${INK}`,
              [right ? 'borderRight' : 'borderLeft']: `6px solid ${INK}`,
              transform:    right ? 'skewY(28deg) rotate(-18deg)' : 'skewY(-28deg) rotate(18deg)',
            }}
          />
          <div
            style={{
              position:      'absolute',
              top:           -30,
              [right ? 'right' : 'left']: 40,
              background:    INK,
              color:         gold,
              fontFamily:    `${nameFont}, Arial, sans-serif`,
              fontSize:      30,
              fontWeight:    700,
              lineHeight:    1,
              letterSpacing: 3,
              padding:       '12px 22px',
              borderRadius:  12,
              textTransform: 'uppercase',
            }}
          >
            PipsGravity
          </div>
          <div
            style={{
              fontFamily: `${fontFamily}, Arial, sans-serif`,
              fontSize:   FONT_PX,
              fontWeight: 800,
              lineHeight: 1.3,
              height:     FONT_PX * 1.3 * 2,   // fixed: bubble never resizes between lines
              overflow:   'hidden',
              color:      INK,
            }}
          >
            {line.map((cap, i) => {
              const w = (currentSec - cap.start) * fps;   // frames since this word was spoken
              // gold_words effect: a gold marker sweeps behind the key term as it is spoken
              const gold = goldWords && goldWords.includes(normWord(cap.word));
              return (
                <span
                  key={i}
                  style={{
                    display:     'inline-block',
                    marginRight: '0.26em',
                    ...(gold ? {
                      backgroundImage:    `linear-gradient(${brand.accent || '#C9A84C'}, ${brand.accent || '#C9A84C'})`,
                      backgroundRepeat:   'no-repeat',
                      backgroundPosition: '0 85%',
                      backgroundSize:     `${(easeOut3(w / 8) * 100).toFixed(0)}% 45%`,
                      padding:            '0 0.08em',
                    } : {}),
                    opacity:     clamp01(w / 3),
                    transform:   `translateY(${(1 - clamp01(w / 5)) * 18}px) scale(${0.7 + 0.3 * pop(w / 6)})`,
                  }}
                >
                  {cap.word}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}


// ── ProductPopup ─────────────────────────────────────────────────────────────
// When the voiceover names the "PipsGravity Mastermind Trading Plan", the product
// image slides in from the RIGHT on a white card, holds, and slides out to the
// LEFT, max 4 s. The frozen video blurs + dims behind it; captions stay on top.
// Owner-approved look: preview v3 (maint doc MAINT-2026-09-14 Session 7f).
const POPUP_IN      = 0.55;   // s, easeOutBack from the right, tilt +8° → 0
const POPUP_HOLD    = 2.45;   // s, gentle float + one light sweep
const POPUP_OUT     = 0.5;    // s, easeInCubic out to the left, tilt 0 → -8°
const POPUP_MAX     = 4;      // s, Owner cap
const POPUP_BLUR_PX = 40;     // preview's 16px on a ~400px stage, scaled to 1080
const POPUP_DIM     = 0.35;

const normWord = (w) => String(w || '').toLowerCase().replace(/[^a-z]/g, '');

// Finds the first "(PipsGravity) Mastermind Trading Plan" in a segment's word
// timestamps. Tolerates Whisper splits ("Pips Gravity", "Master mind") and
// punctuation. Returns { start, end } in segment seconds, or null.
export function productWindow(captions, segDuration) {
  const w = (captions || []).map((c) => normWord(c.word));
  for (let i = 0; i < w.length; i++) {
    let next = i + 1;
    if (w[i] === 'master' && w[i + 1] === 'mind') next = i + 2;
    else if (!w[i].startsWith('mastermind')) continue;
    if (w[next] !== 'trading') continue;
    let first = i;                                         // start on "PipsGravity" if it leads
    if (/gravitys?$/.test(w[i - 1] || '')) first = i - 1;
    if (w[first] === 'gravity' && w[first - 1] === 'pips') first -= 1;
    const start = captions[first].start;
    const end   = Math.min(start + POPUP_IN + POPUP_HOLD + POPUP_OUT, start + POPUP_MAX, segDuration ?? Infinity);
    return end > start ? { start, end } : null;
  }
  return null;
}

const outBack = (p) => { const k = 1.55; return 1 + (k + 1) * (p - 1) ** 3 + k * (p - 1) ** 2; };

// Pure motion state for time t (segment seconds). blur 0 = popup not on screen.
export function productPopupState(t, win) {
  const off = { blur: 0, x: 130, rot: 8, y: 0, opacity: 0, sweep: 250 };
  if (!win || t < win.start || t >= win.end) return off;
  const total = win.end - win.start;
  // Short window (product named right before the pause ends): shrink in/out, drop hold.
  const k    = Math.min(1, total / (POPUP_IN + POPUP_OUT));
  const tin  = POPUP_IN * k;
  const tout = POPUP_OUT * k;
  const hold = total - tin - tout;
  const a    = t - win.start;
  if (a < tin) {
    const e = outBack(clamp01(a / tin));
    return { blur: clamp01(a / tin), x: 130 - 130 * e, rot: 8 - 8 * e, y: 0, opacity: clamp01(a / 0.16), sweep: 250 };
  }
  if (a < tin + hold) {
    const h = a - tin;
    return { blur: 1, x: 0, rot: 0, y: Math.sin((h / POPUP_HOLD) * Math.PI * 2), opacity: 1, sweep: 250 - clamp01((h - 0.3) / 0.9) * 250 };
  }
  const o = clamp01((a - tin - hold) / tout);
  return { blur: 1 - o, x: -130 * o ** 3, rot: -8 * o ** 3, y: 0, opacity: 1 - clamp01((a - tin - hold - tout + 0.16) / 0.16), sweep: 250 };
}

function ProductPopup({ state }) {
  const cqw = CANVAS_W / 100;   // preview units were % of stage width
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: `rgba(6,10,18,${(state.blur * POPUP_DIM).toFixed(3)})` }} />
      <div
        style={{
          position:  'absolute',
          left:      11 * cqw,
          top:       30 * cqw,
          width:     78 * cqw,
          opacity:   state.opacity,
          transform: `translate(${state.x}%, ${state.y * 0.5 * cqw}px) rotate(${state.rot}deg)`,
        }}
      >
        <div
          style={{
            background:   '#FFFFFF',
            borderRadius: 4 * cqw,
            padding:      3 * cqw,
            boxShadow:    `0 ${5 * cqw}px ${10 * cqw}px ${-3 * cqw}px rgba(0,0,0,.6), 0 0 0 ${0.3 * cqw}px rgba(255,255,255,.6)`,
          }}
        >
          <Img
            src={staticFile('assets/products/mastermind_trading_plan.png')}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        </div>
        <div
          style={{
            position:           'absolute',
            inset:              0,
            borderRadius:       4 * cqw,
            background:         'linear-gradient(105deg,transparent 40%,rgba(255,255,255,.75) 50%,transparent 60%)',
            backgroundSize:     '250% 100%',
            backgroundPosition: `${state.sweep}% 0`,
            mixBlendMode:       'soft-light',
          }}
        />
      </div>
    </AbsoluteFill>
  );
}


// ── CTABanner ────────────────────────────────────────────────────────────────
// Pre-baked 1080×110 CTA banner PNG at bottom of the CTA freeze frame.
// Fast fade-in over 8 frames (0.27s at 30fps).
function CTABanner({ bannerUrl }) {
  const frame       = useCurrentFrame();
  const FADE_FRAMES = 8;
  const opacity     = Math.min(frame / Math.max(FADE_FRAMES, 1), 1);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <Img
        src={bannerUrl}
        style={{
          position: 'absolute',
          bottom:   CTA_BOTTOM,
          left:     0,
          width:    CANVAS_W,
          height:   CTA_H,
        }}
      />
    </AbsoluteFill>
  );
}