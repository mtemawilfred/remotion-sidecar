// ── components/RepurposeLongForm.jsx ─────────────────────────────────────────
// MASTERCLASS rebuild of the long-form repurposing composition.
// render_type: 'REPURPOSE_LONG_FORM'   ·   Canvas 1920×1080 @ 30fps (16:9)
//
// WHAT CHANGED vs the old freeze-and-explain version
//   • One persistent graphics WORLD (white) with the chart as a LAYER inside it.
//   • Camera ZOOM: the chart layer scales/positions between full-frame and an
//     inset at any anchor (the canvas-zoom mechanic).
//   • Component DISPATCHER: each segment renders graphics from a `components[]`
//     list, entering at `enter_at_ms` (from the Timing Director / Animator).
//   • Captions = word-synced (copper highlight, Poppins).
//
// MEMORY / OOM — the important part (why the old one crashed on tiny videos):
//   • OLD: every freeze segment mounted a full <OffthreadVideo> wrapped in
//     <Freeze>. Many full-video decoders alive at once → OOM regardless of
//     output size.
//   • NEW: freezes render as a still <Img> (seg.chart.freeze_frame_url) — near
//     zero memory. Only LIVE segments mount a video, and via @remotion/media
//     <Video> (memory-efficient) trimmed to just the played range.
//   • Pair this with renderer.js settings: low concurrency +
//     offthreadVideoCacheSizeInBytes (see INTEGRATION.md).
//
// FALLBACKS: if a freeze has no freeze_frame_url we <Freeze> a <Video> (works,
// but heavier — the workflow should always send freeze_frame_url).
// If the payload still uses the OLD `sequence` (live/freeze) shape, we render it
// in a backward-compatible path so nothing breaks during migration.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  AbsoluteFill,
  Freeze,
  Img,
  Sequence,
  interpolate,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Video, Audio } from '@remotion/media';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily: POPPINS } = loadPoppins();
const { fontFamily: MONO }    = loadJetBrainsMono();

// ── Canvas ────────────────────────────────────────────────────────────────────
const CANVAS_W = 1920;
const CANVAS_H = 1080;
const BGM_VOLUME = 0.1;
const INSET_MARGIN = 0.045;          // 4.5% margin for the inset chart
const INSET_SCALE_DEFAULT = 0.42;

// ── helpers ─────────────────────────────────────────────────────────────────
const ms2f = (ms, fps) => Math.round(((ms || 0) / 1000) * fps);

const brandOf = (b = {}) => ({
  background:   b.background   || '#FFFFFF',
  primary:      b.primary      || '#14315F',
  accent:       b.accent       || '#C0531F',
  ink:          b.ink          || '#1B2330',
  slate:        b.slate        || '#5B6471',
  panel:        b.panel        || '#F6F8FB',
  fontHeading:  b.font_heading || POPPINS,
  fontBody:     b.font_body    || POPPINS,
  fontMono:     b.font_mono    || MONO,
});

const fill = { width: '100%', height: '100%', objectFit: 'contain' };

// Resolve an inset anchor (or free {x,y}) to a centre point in px.
function resolveCentre(state, scale) {
  if (state && typeof state.x === 'number' && typeof state.y === 'number') {
    return { cx: state.x * CANVAS_W, cy: state.y * CANVAS_H };
  }
  const hw = (scale * CANVAS_W) / 2;
  const hh = (scale * CANVAS_H) / 2;
  const m = INSET_MARGIN;
  const xL = m * CANVAS_W + hw, xR = CANVAS_W - m * CANVAS_W - hw, xC = CANVAS_W / 2;
  const yT = m * CANVAS_H + hh, yB = CANVAS_H - m * CANVAS_H - hh, yC = CANVAS_H / 2;
  const map = {
    top_left: [xL, yT], top_right: [xR, yT],
    bottom_left: [xL, yB], bottom_right: [xR, yB],
    center_left: [xL, yC], center_right: [xR, yC],
    center: [xC, yC],
  };
  const [cx, cy] = map[(state && state.anchor) || 'center_right'] || map.center_right;
  return { cx, cy };
}

const transformStr = (scale, cx, cy) =>
  `translate(${cx - CANVAS_W / 2}px, ${cy - CANVAS_H / 2}px) scale(${scale})`;

// ════════════════════════════════════════════════════════════════════════════
// TOP-LEVEL COMPOSITION
// ════════════════════════════════════════════════════════════════════════════
export const RepurposeLongForm = ({ sceneJson }) => {
  const { fps } = useVideoConfig();
  const brand = brandOf(sceneJson.brand);

  // Backward-compat: old payloads use `sequence`; new ones use `timeline`.
  const isLegacy = !sceneJson.timeline && Array.isArray(sceneJson.sequence);
  const rawSegs = sceneJson.timeline || sceneJson.sequence || [];
  const srcUrl  = sceneJson.source_video_url;
  const bgmUrl  = sceneJson.bg_music_url;

  // Camera track keyed by segment_id.
  const camMap = {};
  (sceneJson.camera || []).forEach((c) => { camMap[c.segment_id] = c; });

  // Pre-calculate absolute frame offsets.
  let offset = 0;
  const segs = rawSegs.map((s, i) => {
    const durSec = isLegacy
      ? (s.type === 'live' ? s.end_time - s.start_time : s.duration)
      : (s.duration_ms || 3000) / 1000;
    const frameCount = Math.max(1, Math.ceil(durSec * fps));
    const seg = { ...s, _i: i, frameStart: offset, frameCount };
    offset += frameCount;
    return seg;
  });

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: brand.background }}>
      <World brand={brand} />

      {segs.map((seg) => (
        <Sequence key={seg._i} from={seg.frameStart} durationInFrames={seg.frameCount}>
          <SegmentView
            seg={seg}
            srcUrl={srcUrl}
            fps={fps}
            brand={brand}
            cam={camMap[seg.segment_id]}
            isLegacy={isLegacy}
          />
        </Sequence>
      ))}

      {bgmUrl && <Audio src={bgmUrl} volume={BGM_VOLUME} loop />}
    </AbsoluteFill>
  );
};

// ── Persistent world (background) ──────────────────────────────────────────
function World({ brand }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 120% at 50% 0%, ${brand.background} 0%, #F6F8FB 100%)`,
      }}
    >
      {/* ultra-subtle dot texture */}
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(#EEF2F9 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.6,
        }}
      />
    </AbsoluteFill>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ONE SEGMENT  (chart layer + graphics + captions + audio)
// ════════════════════════════════════════════════════════════════════════════
function SegmentView({ seg, srcUrl, fps, brand, cam, isLegacy }) {
  // Legacy path keeps the old live/freeze behaviour intact.
  if (isLegacy) return <LegacySegment seg={seg} srcUrl={srcUrl} fps={fps} brand={brand} />;

  const mode = seg.canvas_mode || 'graphics';
  const showChart = mode !== 'graphics' && seg.chart && seg.chart.visible !== false;

  return (
    <AbsoluteFill>
      {showChart && (
        <ChartLayer seg={seg} srcUrl={srcUrl} fps={fps} cam={cam} mode={mode} />
      )}

      {(seg.components || []).map((c, i) => (
        <ComponentLayer key={i} comp={c} seg={seg} fps={fps} brand={brand} />
      ))}

      {seg.captions && seg.captions.length > 0 && (
        <Captions captions={seg.captions} fps={fps} brand={brand} />
      )}

      {seg.audio_url && <Audio src={seg.audio_url} />}

      {(seg.sfx || []).map((s, i) =>
        s.url ? (
          <Sequence key={`sfx${i}`} from={ms2f(s.at_ms, fps)} layout="none">
            <Audio src={s.url} volume={s.gain ?? 0.6} />
          </Sequence>
        ) : null
      )}
    </AbsoluteFill>
  );
}

// ── Chart layer with camera zoom (memory-safe) ─────────────────────────────
function ChartLayer({ seg, srcUrl, fps, cam, mode }) {
  const frame = useCurrentFrame();
  const chart = seg.chart || {};

  // Compute the camera transform for this frame.
  let scale, cx, cy;
  if (cam && cam.from && cam.to) {
    const dur = Math.min(ms2f(cam.duration_ms || 700, fps), seg.frameCount);
    const t = interpolate(frame, [0, dur], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    });
    const sFrom = cam.from.scale ?? INSET_SCALE_DEFAULT;
    const sTo   = cam.to.scale   ?? 1;
    const from  = resolveCentre(cam.from, sFrom);
    const to    = resolveCentre(cam.to,   sTo);
    scale = sFrom + (sTo - sFrom) * t;
    cx = from.cx + (to.cx - from.cx) * t;
    cy = from.cy + (to.cy - from.cy) * t;
  } else if (mode === 'chart_full') {
    scale = 1; cx = CANVAS_W / 2; cy = CANVAS_H / 2;
  } else {
    // static inset
    const s = chart.scale || INSET_SCALE_DEFAULT;
    const c = resolveCentre({ anchor: chart.anchor }, s);
    scale = s; cx = c.cx; cy = c.cy;
  }

  const playing = mode === 'chart_full' && chart.state !== 'frozen';

  return (
    <AbsoluteFill
      style={{ transform: transformStr(scale, cx, cy), transformOrigin: 'center center' }}
    >
      {/* rounded frame when inset */}
      <AbsoluteFill
        style={{
          borderRadius: scale < 0.95 ? 20 : 0,
          overflow: 'hidden',
          boxShadow: scale < 0.95 ? '0 20px 60px rgba(11,30,64,0.25)' : 'none',
          border: scale < 0.95 ? '2px solid #14315F' : 'none',
          background: '#FFFFFF',
        }}
      >
        {playing ? (
          <Video
            src={srcUrl}
            trimBefore={ms2f((chart.play_from || 0) * 1000, fps)}
            trimAfter={ms2f((chart.play_to || 0) * 1000, fps)}
            muted
            style={fill}
          />
        ) : chart.freeze_frame_url ? (
          // PREFERRED: still image = near-zero memory
          <Img src={chart.freeze_frame_url} style={fill} />
        ) : (
          // FALLBACK: freeze a video frame (heavier — avoid in production)
          <Freeze frame={ms2f((chart.freeze_at || 0) * 1000, fps)}>
            <Video src={srcUrl} muted style={fill} />
          </Freeze>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT DISPATCHER  (drop new component renderers in here)
// Every component enters at comp.enter_at_ms (relative to its segment).
// ════════════════════════════════════════════════════════════════════════════
function useEnter(enterAtMs, fps, durMs = 420) {
  const frame = useCurrentFrame();
  const settle = ms2f(enterAtMs, fps);
  const start = Math.max(0, settle - ms2f(durMs, fps));
  const opacity = interpolate(frame, [start, settle], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  const ty = interpolate(frame, [start, settle], [24, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  return { opacity, transform: `translateY(${ty}px)` };
}

function ComponentLayer({ comp, seg, fps, brand }) {
  switch (comp.type) {
    case 'hook_text':     return <HookText c={comp} fps={fps} brand={brand} />;
    case 'concept_card':  return <ConceptCard c={comp} fps={fps} brand={brand} />;
    case 'roadmap':
    case 'concept_list':  return <Roadmap c={comp} fps={fps} brand={brand} />;
    case 'stat_callout':  return <StatCallout c={comp} fps={fps} brand={brand} />;
    case 'annotation':    return <Annotation c={comp} fps={fps} brand={brand} />;
    case 'callback_card': return <CallbackCard c={comp} fps={fps} brand={brand} />;
    case 'outro_cta':     return <OutroCTA c={comp} fps={fps} brand={brand} />;
    case 'brand_bug':     return <BrandBug c={comp} brand={brand} />;
    case 'diagram':       return <DiagramStub c={comp} fps={fps} brand={brand} />;
    case 'table':         return <TableStub c={comp} fps={fps} brand={brand} />;
    case 'connector':     return <ConnectorStub c={comp} fps={fps} brand={brand} />;
    default:              return <GenericCard c={comp} fps={fps} brand={brand} />;
  }
}

// ── Core components (first pass — refine visuals from design mode) ──────────
function HookText({ c, fps, brand }) {
  const e = useEnter(c.enter_at_ms, fps);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 120px' }}>
      <div style={{ ...e }}>
        <div style={{
          fontFamily: brand.fontHeading, fontWeight: 800, fontSize: 130, lineHeight: 1.02,
          color: brand.primary, letterSpacing: '-0.02em',
        }}>
          {c.primary}{' '}
          {c.secondary && <span style={{ color: brand.accent }}>{c.secondary}</span>}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ConceptCard({ c, fps, brand }) {
  const e = useEnter(c.enter_at_ms, fps);
  return (
    <Zone seg_anchor={c.anchor}>
      <div style={{
        ...e, background: brand.panel, borderRadius: 24, border: '1px solid #E6E9EF',
        padding: '40px 48px', maxWidth: 760, boxShadow: '0 16px 48px rgba(11,30,64,0.08)',
      }}>
        {c.title && (
          <div style={{ fontFamily: brand.fontHeading, fontWeight: 600, fontSize: 46, color: brand.primary, marginBottom: 16 }}>
            {c.title}
          </div>
        )}
        {c.screenshot_ref_url && (
          <Img src={c.screenshot_ref_url} style={{
            width: '100%', borderRadius: 12, border: '1px solid #CDD4DF', marginBottom: 20,
          }} />
        )}
        {c.body && (
          <div style={{ fontFamily: brand.fontBody, fontWeight: 400, fontSize: 30, lineHeight: 1.4, color: brand.ink }}>
            {c.body}
          </div>
        )}
      </div>
    </Zone>
  );
}

function Roadmap({ c, fps, brand }) {
  const rows = c.items || c.rows || [];
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 900 }}>
        {rows.map((r, i) => (
          <Row key={i} idx={i} label={typeof r === 'string' ? r : r.label} fps={fps} brand={brand}
               baseMs={(c.enter_at_ms || 0) + i * 250} />
        ))}
      </div>
    </AbsoluteFill>
  );
}
function Row({ idx, label, fps, brand, baseMs }) {
  const e = useEnter(baseMs, fps);
  return (
    <div style={{ ...e, display: 'flex', alignItems: 'center', gap: 24, background: brand.panel,
      border: '1px solid #E6E9EF', borderRadius: 16, padding: '22px 28px' }}>
      <div style={{ width: 56, height: 56, borderRadius: 12, background: brand.primary, color: '#fff',
        fontFamily: brand.fontHeading, fontWeight: 700, fontSize: 30, display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</div>
      <div style={{ fontFamily: brand.fontBody, fontWeight: 600, fontSize: 36, color: brand.primary }}>{label}</div>
    </div>
  );
}

function StatCallout({ c, fps, brand }) {
  const e = useEnter(c.enter_at_ms, fps);
  return (
    <Zone seg_anchor={c.anchor}>
      <div style={{ ...e, textAlign: 'center' }}>
        <div style={{ fontFamily: brand.fontHeading, fontWeight: 800, fontSize: 160, color: brand.accent, lineHeight: 1 }}>
          {c.value}
        </div>
        {c.label && <div style={{ fontFamily: brand.fontBody, fontSize: 34, color: brand.slate, marginTop: 8 }}>{c.label}</div>}
      </div>
    </Zone>
  );
}

function Annotation({ c, fps, brand }) {
  const frame = useCurrentFrame();
  const settle = ms2f(c.enter_at_ms, fps);
  const s = interpolate(frame, [Math.max(0, settle - ms2f(280, fps)), settle], [0.7, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.7)),
  });
  const o = interpolate(frame, [Math.max(0, settle - ms2f(280, fps)), settle], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const x = (c.x ?? 0.5) * CANVAS_W, y = (c.y ?? 0.5) * CANVAS_H;
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) scale(${s})`, opacity: o }}>
      <div style={{ background: brand.accent, color: '#fff', fontFamily: brand.fontHeading, fontWeight: 700,
        fontSize: 32, padding: '12px 22px', borderRadius: 12, whiteSpace: 'nowrap',
        boxShadow: '0 8px 24px rgba(192,83,31,0.35)' }}>{c.label}</div>
    </div>
  );
}

function CallbackCard({ c, fps, brand }) {
  const e = useEnter(c.enter_at_ms, fps);
  return (
    <Zone seg_anchor={c.anchor}>
      <div style={{ ...e, background: brand.panel, borderLeft: `6px solid ${brand.accent}`,
        borderRadius: 16, padding: '32px 36px', maxWidth: 640 }}>
        <div style={{ fontFamily: brand.fontMono, fontSize: 22, color: brand.accent, marginBottom: 8 }}>
          {c.tag || 'REMEMBER'}
        </div>
        <div style={{ fontFamily: brand.fontHeading, fontWeight: 600, fontSize: 40, color: brand.primary }}>
          {c.title}
        </div>
        {c.body && <div style={{ fontFamily: brand.fontBody, fontSize: 28, color: brand.ink, marginTop: 12 }}>{c.body}</div>}
      </div>
    </Zone>
  );
}

function OutroCTA({ c, fps, brand }) {
  const e = useEnter(c.enter_at_ms, fps);
  return (
    <AbsoluteFill style={{ background: brand.primary, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ ...e, textAlign: 'center', padding: '0 160px' }}>
        <div style={{ fontFamily: brand.fontHeading, fontWeight: 700, fontSize: 84, color: '#fff', lineHeight: 1.1 }}>
          {c.headline}
        </div>
        {c.button && (
          <div style={{ display: 'inline-block', marginTop: 40, background: brand.accent, color: '#fff',
            fontFamily: brand.fontHeading, fontWeight: 700, fontSize: 40, padding: '20px 44px', borderRadius: 16 }}>
            {c.button}
          </div>
        )}
        {c.link && <div style={{ fontFamily: brand.fontBody, fontSize: 30, color: '#AEBBD2', marginTop: 24 }}>{c.link}</div>}
      </div>
    </AbsoluteFill>
  );
}

function BrandBug({ c, brand }) {
  return (
    <div style={{ position: 'absolute', bottom: 36, right: 44, fontFamily: brand.fontHeading,
      fontWeight: 700, fontSize: 28, color: brand.primary, opacity: 0.35 }}>
      {c.text || 'PipsGravity'}
    </div>
  );
}

// ── First-pass stubs (functional; refine in design mode) ────────────────────
function DiagramStub({ c, fps, brand }) {
  const e = useEnter(c.enter_at_ms, fps);
  return (
    <Zone seg_anchor={c.anchor}>
      <div style={{ ...e, fontFamily: brand.fontMono, fontSize: 26, color: brand.slate,
        border: `2px dashed ${brand.primary}`, borderRadius: 16, padding: 40 }}>
        [diagram: {c.shape || c.label || 'concept'}]
      </div>
    </Zone>
  );
}
function TableStub({ c, fps, brand }) {
  const e = useEnter(c.enter_at_ms, fps);
  return (
    <Zone seg_anchor={c.anchor}>
      <div style={{ ...e, fontFamily: brand.fontMono, fontSize: 26, color: brand.slate,
        border: `1px solid #E6E9EF`, borderRadius: 16, padding: 40 }}>
        [table]
      </div>
    </Zone>
  );
}
function ConnectorStub() { return null; } // draw-on arrow — implement after design mode
function GenericCard({ c, fps, brand }) {
  const e = useEnter(c.enter_at_ms, fps);
  return (
    <Zone seg_anchor={c.anchor}>
      <div style={{ ...e, fontFamily: brand.fontBody, fontSize: 30, color: brand.ink, background: brand.panel,
        borderRadius: 16, padding: 32 }}>{c.title || c.text || c.type}</div>
    </Zone>
  );
}

// Places graphics in a sensible zone. If the chart inset is on the right, put
// graphics on the left, and vice-versa. (Refined later by the Animator/layout.)
function Zone({ seg_anchor, children }) {
  const left = String(seg_anchor || '').includes('right'); // chart right → graphics left
  return (
    <AbsoluteFill style={{
      justifyContent: 'center',
      alignItems: 'center',
      padding: '0 120px',
      ...(left ? { right: '50%' } : { left: '50%' }),
    }}>
      {children}
    </AbsoluteFill>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CAPTIONS  (word-synced, copper highlight)
// ════════════════════════════════════════════════════════════════════════════
function Captions({ captions, fps, brand }) {
  const frame = useCurrentFrame();
  const sec = frame / fps;

  // group into <=8-word chunks, breaking on punctuation
  const chunks = [];
  let cur = [];
  captions.forEach((cap) => {
    cur.push(cap);
    const brk = /[.,!?;]$/.test(cap.word);
    if ((brk && cur.length >= 3) || cur.length >= 8) { chunks.push(cur); cur = []; }
  });
  if (cur.length) chunks.push(cur);

  let active = 0;
  chunks.forEach((ch, i) => { if (sec >= ch[0].start) active = i; });
  const chunk = chunks[active] || [];
  if (!captions.length || sec < captions[0].start) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', bottom: 56, left: 96, right: 96, display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(20,49,95,0.85)', borderRadius: 18, padding: '18px 40px', maxWidth: '88%', textAlign: 'center' }}>
          {chunk.map((cap, i) => {
            const on = sec >= cap.start && sec < cap.end;
            const past = sec >= cap.end;
            return (
              <span key={i} style={{
                fontFamily: brand.fontBody, fontSize: 46, fontWeight: on ? 800 : 600,
                color: on ? brand.accent : '#FFFFFF', opacity: past ? 0.6 : 1,
              }}>{cap.word}{' '}</span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LEGACY PATH (old live/freeze payload) — kept so nothing breaks mid-migration.
// Uses still-image freezes when freeze_frame_url is present (OOM-safe).
// ════════════════════════════════════════════════════════════════════════════
function LegacySegment({ seg, srcUrl, fps, brand }) {
  if (seg.type === 'live') {
    return (
      <AbsoluteFill>
        <Video src={srcUrl} trimBefore={Math.round(seg.start_time * fps)} trimAfter={Math.round(seg.end_time * fps)} muted style={fill} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      {seg.freeze_frame_url ? (
        <Img src={seg.freeze_frame_url} style={fill} />
      ) : (
        <Freeze frame={Math.round(seg.timestamp * fps)}>
          <Video src={srcUrl} muted style={fill} />
        </Freeze>
      )}
      {seg.audio_url && <Audio src={seg.audio_url} />}
      {seg.captions && seg.captions.length > 0 && (
        <Captions captions={seg.captions} fps={fps} brand={brand} />
      )}
    </AbsoluteFill>
  );
}