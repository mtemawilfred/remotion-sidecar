// ── components/RepurposeLongForm.jsx ─────────────────────────────────────────
// MASTERCLASS long-form composition. render_type: 'REPURPOSE_LONG_FORM'
// 1920×1080 @ 30fps. v3 — applies the motion-graphics research (DEEP spec):
//   • Per-scene BACKGROUND TREATMENT (ghost word + radial glow + hairline rule,
//     slow drift) so scenes are never flat/empty during stagger.
//   • VARIED ENTRANCE LIBRARY (rise/slideL/slideR/pop/blur/spread), varied
//     durations (hero slow, details fast) — no monoculture.
//   • KEYWORD HIGHLIGHT sweep behind the active caption word.
//   • stat_callout gets a visual (fill bar) + tabular-nums.
//   • Dropped AI tells: callback left-stripe → top chip; roadmap identical grid
//     → alternating offsets + ghost index.
//   • Captions tightened (~6 words) + text stroke for legibility over the chart.
//   • Soft fade-in per segment (over the persistent world) — no hard jump-cuts.
//   • Ken Burns drift on the frozen chart inset.
//   • Weight contrast (900 display / 400 body), tighter display tracking.
// Chart layer + camera zoom unchanged (they work).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { AbsoluteFill, Freeze, Img, Sequence, interpolate, Easing, useCurrentFrame, useVideoConfig } from 'remotion';
import { Video, Audio } from '@remotion/media';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily: POPPINS } = loadPoppins();
const { fontFamily: MONO }    = loadJetBrainsMono();
const SANS  = `${POPPINS}, 'Noto Color Emoji', sans-serif`;
const MONOS = `${MONO}, 'Noto Color Emoji', monospace`;

const CANVAS_W = 1920, CANVAS_H = 1080;
const MARGIN = 110, TOP = 130, BOTTOM = 905;
const BGM_VOLUME = 0.1, INSET_MARGIN = 0.05, INSET_SCALE_DEFAULT = 0.42;

const ms2f = (ms, fps) => Math.round(((ms || 0) / 1000) * fps);

const brandOf = (b = {}) => ({
  background: b.background || '#FFFFFF', ink: b.ink || '#1B2330', primary: b.primary || '#14315F',
  accent: b.accent || '#C0531F', slate: b.slate || '#5B6471', panel: b.panel || '#F6F8FB',
  periwinkle: '#6E86C9', border: '#E6E9EF',
});

const fill = { width: '100%', height: '100%', objectFit: 'contain' };
const fillVid = { width: '100%', height: '100%' };

// ── varied entrance library ──────────────────────────────────────────────────
const ENTRANCES = ['rise', 'slideL', 'pop', 'slideR', 'blur', 'spread'];
function entrance(kind, frame, settleF, fps, durMs = 420) {
  const start = Math.max(0, settleF - ms2f(durMs, fps));
  const ease = kind === 'pop' ? Easing.out(Easing.back(1.6)) : Easing.out(Easing.cubic);
  const t = interpolate(frame, [start, settleF], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  if (kind === 'blur')   return { opacity: t, filter: `blur(${(1 - t) * 10}px)` };
  if (kind === 'spread') return { opacity: t, letterSpacing: `${(1 - t) * 0.12}em` };
  let tf;
  if (kind === 'slideL') tf = `translateX(${(1 - t) * -46}px)`;
  else if (kind === 'slideR') tf = `translateX(${(1 - t) * 46}px)`;
  else if (kind === 'pop') tf = `scale(${0.86 + 0.14 * t})`;
  else tf = `translateY(${(1 - t) * 26}px)`;
  return { opacity: t, transform: tf };
}
// gentle ambient drift for held elements / decoratives
function drift(frame, fps, ampX = 6, ampY = 4, period = 8) {
  const p = (frame / fps) / period * Math.PI * 2;
  return `translate(${Math.sin(p) * ampX}px, ${Math.cos(p * 0.8) * ampY}px)`;
}

function resolveCentre(state, scale) {
  if (state && typeof state.x === 'number' && typeof state.y === 'number') return { cx: state.x * CANVAS_W, cy: state.y * CANVAS_H };
  const hw = (scale * CANVAS_W) / 2, hh = (scale * CANVAS_H) / 2, m = INSET_MARGIN;
  const xL = m * CANVAS_W + hw, xR = CANVAS_W - m * CANVAS_W - hw, xC = CANVAS_W / 2;
  const yT = m * CANVAS_H + hh, yB = CANVAS_H - m * CANVAS_H - hh, yC = CANVAS_H / 2;
  const map = { top_left:[xL,yT], top_right:[xR,yT], bottom_left:[xL,yB], bottom_right:[xR,yB], center_left:[xL,yC], center_right:[xR,yC], center:[xC,yC] };
  const [cx, cy] = map[(state && state.anchor) || 'center_right'] || map.center_right;
  return { cx, cy };
}
const transformStr = (s, cx, cy) => `translate(${cx - CANVAS_W/2}px, ${cy - CANVAS_H/2}px) scale(${s})`;

function itemFrames(count, segFrames, fps, provided) {
  if (Array.isArray(provided) && provided.length === count && provided.every(t => t != null)) return provided.map(t => ms2f(t, fps));
  const first = ms2f(150, fps), last = Math.max(first, Math.floor(segFrames * 0.62));
  if (count <= 1) return [first];
  return Array.from({ length: count }, (_, i) => Math.round(first + (last - first) * (i / (count - 1))));
}

function graphicsZone(mode, chartAnchor) {
  if (mode === 'chart_inset') {
    const a = chartAnchor || 'center_right';
    if (a.includes('right')) return { left: MARGIN, top: TOP, width: CANVAS_W/2 - MARGIN - 30, height: BOTTOM - TOP };
    if (a.includes('left'))  return { left: CANVAS_W/2 + 30, top: TOP, width: CANVAS_W/2 - MARGIN - 30, height: BOTTOM - TOP };
    return { left: MARGIN, top: TOP, width: CANVAS_W - 2*MARGIN, height: (BOTTOM - TOP) * 0.45 };
  }
  return { left: 280, top: TOP, width: CANVAS_W - 560, height: BOTTOM - TOP };
}

// ════════════════════════════════════════════════════════════════════════════
export const RepurposeLongForm = ({ sceneJson }) => {
  const { fps } = useVideoConfig();
  const brand = brandOf(sceneJson.brand);
  const isLegacy = !sceneJson.timeline && Array.isArray(sceneJson.sequence);
  const rawSegs = sceneJson.timeline || sceneJson.sequence || [];
  const srcUrl = sceneJson.source_video_url, bgmUrl = sceneJson.bg_music_url;
  const camMap = {}; (sceneJson.camera || []).forEach(c => { camMap[c.segment_id] = c; });
  let offset = 0;
  const segs = rawSegs.map((s, i) => {
    const durSec = isLegacy ? (s.type === 'live' ? s.end_time - s.start_time : s.duration) : (s.duration_ms || 3000) / 1000;
    const frameCount = Math.max(1, Math.ceil(durSec * fps));
    const seg = { ...s, _i: i, frameStart: offset, frameCount }; offset += frameCount; return seg;
  });
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: brand.background }}>
      <World brand={brand} />
      {segs.map(seg => (
        <Sequence key={seg._i} from={seg.frameStart} durationInFrames={seg.frameCount}>
          <SegmentView seg={seg} srcUrl={srcUrl} fps={fps} brand={brand} cam={camMap[seg.segment_id]} isLegacy={isLegacy} />
        </Sequence>
      ))}
      {bgmUrl && <Audio src={bgmUrl} volume={BGM_VOLUME} loop />}
    </AbsoluteFill>
  );
};

function World({ brand }) {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(130% 130% at 50% 0%, ${brand.background} 0%, #F4F7FB 100%)` }}>
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(#EEF2F9 1px, transparent 1px)', backgroundSize: '46px 46px', opacity: 0.5 }} />
    </AbsoluteFill>
  );
}

function SegmentView({ seg, srcUrl, fps, brand, cam, isLegacy }) {
  const frame = useCurrentFrame();
  if (isLegacy) return <LegacySegment seg={seg} srcUrl={srcUrl} fps={fps} brand={brand} />;

  const mode = seg.canvas_mode || 'graphics';
  const showChart = mode !== 'graphics' && seg.chart && seg.chart.visible !== false;
  const comps = seg.components || [];
  const outro = comps.find(c => c.type === 'outro_cta');
  if (outro) return <OutroCTA c={outro} seg={seg} fps={fps} brand={brand} />;

  const annos = comps.filter(c => c.type === 'annotation');
  const flow = comps.filter(c => !['outro_cta', 'annotation', 'brand_bug'].includes(c.type));
  const chartAnchor = (seg.chart && seg.chart.anchor) || (cam && cam.to && cam.to.anchor) || 'center_right';
  const zone = graphicsZone(mode, chartAnchor);
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {mode === 'graphics' && <BackgroundTreatment flow={flow} seg={seg} fps={fps} brand={brand} />}
      {showChart && <ChartLayer seg={seg} srcUrl={srcUrl} fps={fps} cam={cam} mode={mode} />}
      {flow.length > 0 && <GraphicsStack flow={flow} seg={seg} fps={fps} brand={brand} zone={zone} />}
      {annos.map((a, i) => <Annotation key={i} c={a} seg={seg} fps={fps} brand={brand} mode={mode} chartAnchor={chartAnchor} />)}
      <BrandBug brand={brand} />
      {seg.captions && seg.captions.length > 0 && <Captions captions={seg.captions} fps={fps} brand={brand} />}
      {seg.audio_url && <Audio src={seg.audio_url} />}
      {(seg.sfx || []).map((s, i) => s.url ? (
        <Sequence key={`sfx${i}`} from={ms2f(s.at_ms, fps)} layout="none"><Audio src={s.url} volume={s.gain ?? 0.6} /></Sequence>
      ) : null)}
    </AbsoluteFill>
  );
}

// ── background treatment (kills empty/flat scenes) ──────────────────────────
function BackgroundTreatment({ flow, seg, fps, brand }) {
  const frame = useCurrentFrame();
  const first = flow[0] || {};
  const raw = first.primary || first.title || first.label || (first.value) || seg.phase || '';
  const ghost = String(raw).split(' ').slice(0, 2).join(' ').toUpperCase();
  const glow = 0.10 + 0.03 * Math.sin((frame / fps) / 5 * Math.PI * 2);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {/* radial accent glow, breathing */}
      <div style={{ position: 'absolute', top: '-10%', right: '-8%', width: 1100, height: 1100, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(192,83,31,${glow}) 0%, rgba(192,83,31,0) 60%)` }} />
      {/* giant ghost word, slow drift, bleeding off-frame */}
      {ghost && (
        <div style={{ position: 'absolute', bottom: -40, left: -30, transform: drift(frame, fps, 10, 6, 11) + ' rotate(-4deg)',
          fontFamily: SANS, fontWeight: 900, fontSize: 360, color: brand.primary, opacity: 0.05, whiteSpace: 'nowrap', letterSpacing: '-0.04em' }}>{ghost}</div>
      )}
      {/* hairline rule */}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 96, height: 2, background: brand.border, opacity: 0.7 }} />
    </AbsoluteFill>
  );
}

function GraphicsStack({ flow, seg, fps, brand, zone }) {
  return (
    <div style={{ position: 'absolute', left: zone.left, top: zone.top, width: zone.width, height: zone.height,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'stretch', gap: 20, overflow: 'hidden' }}>
      {flow.map((c, i) => {
        const cc = (c.enter_at_ms == null) ? { ...c, enter_at_ms: 150 + i * 450 } : c;
        return <FlowComponent key={i} c={cc} idx={i} seg={seg} fps={fps} brand={brand} />;
      })}
    </div>
  );
}

function FlowComponent({ c, idx, seg, fps, brand }) {
  const kind = ENTRANCES[idx % ENTRANCES.length];
  const heroDur = idx === 0 ? 680 : 320;             // vary speed: first slow, rest fast
  const p = { c, idx, seg, fps, brand, kind, durMs: heroDur };
  switch (c.type) {
    case 'hook_text':     return <HookText {...p} />;
    case 'concept_card':  return <ConceptCard {...p} />;
    case 'callback_card': return <CallbackCard {...p} />;
    case 'roadmap':
    case 'concept_list':  return <Roadmap {...p} />;
    case 'table':         return <TableC {...p} />;
    case 'stat_callout':  return <StatCallout {...p} />;
    case 'diagram':       return <Diagram {...p} />;
    default:              return <GenericCard {...p} />;
  }
}

function HookText({ c, fps, brand, kind }) {
  const frame = useCurrentFrame();
  const a = entrance('spread', frame, ms2f(c.enter_at_ms || 60, fps), fps, 600);
  const b = entrance('rise', frame, ms2f((c.enter_at_ms || 60) + 420, fps), fps, 480);
  return (
    <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 90, lineHeight: 1.04, letterSpacing: '-0.03em' }}>
      <div style={{ ...a, color: brand.primary }}>{c.primary}</div>
      {c.secondary && <div style={{ ...b, color: brand.accent }}>{c.secondary}</div>}
    </div>
  );
}

function ConceptCard({ c, fps, brand, kind, durMs }) {
  const frame = useCurrentFrame();
  const card = entrance(kind, frame, ms2f(120, fps), fps, durMs);
  const body = entrance('rise', frame, ms2f(c.enter_at_ms || 500, fps), fps, 360);
  return (
    <div style={{ ...card, background: '#FFFFFF', border: `1px solid ${brand.border}`, borderRadius: 20, padding: '34px 38px', boxShadow: '0 14px 40px rgba(11,30,64,0.07)' }}>
      {c.title && <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 38, color: brand.primary, marginBottom: 14 }}>{c.title}</div>}
      {c.screenshot_ref_url && <Img src={c.screenshot_ref_url} style={{ width: '100%', borderRadius: 10, border: '1px solid #CDD4DF', marginBottom: 16 }} />}
      {c.body && <div style={{ ...body, fontFamily: SANS, fontWeight: 400, fontSize: 27, lineHeight: 1.45, color: brand.ink }}>{c.body}</div>}
    </div>
  );
}

// redesigned: no left-edge stripe (AI tell) — a copper "RECALL" chip on top instead
function CallbackCard({ c, fps, brand, kind, durMs }) {
  const frame = useCurrentFrame();
  const card = entrance(kind, frame, ms2f(120, fps), fps, durMs);
  const body = entrance('rise', frame, ms2f(c.enter_at_ms || 500, fps), fps, 360);
  return (
    <div style={{ ...card, background: brand.panel, border: `1px solid ${brand.border}`, borderRadius: 16, padding: '28px 32px' }}>
      <div style={{ display: 'inline-block', background: brand.accent, color: '#fff', fontFamily: MONOS, fontSize: 18, fontWeight: 600, padding: '4px 12px', borderRadius: 8, marginBottom: 14 }}>{c.tag || 'RECALL'}</div>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: brand.primary }}>{c.title}</div>
      {c.body && <div style={{ ...body, fontFamily: SANS, fontSize: 25, color: brand.ink, marginTop: 10, lineHeight: 1.4 }}>{c.body}</div>}
    </div>
  );
}

// varied rows: alternating x-offset + ghost numeral (drops the identical-grid AI tell)
function Roadmap({ c, seg, fps, brand }) {
  const frame = useCurrentFrame();
  const rows = (c.items || c.rows || []).slice(0, 6).map(r => typeof r === 'string' ? { label: r } : r);
  const times = itemFrames(rows.length, seg.frameCount, fps, rows.map(r => r.enter_at_ms));
  const fs = rows.length >= 6 ? 24 : rows.length >= 5 ? 27 : 30;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: rows.length >= 6 ? 12 : 16 }}>
      {rows.map((r, i) => {
        const k = ['slideL', 'slideR'][i % 2];
        const e = entrance(k, frame, times[i], fps, 360);
        return (
          <div key={i} style={{ ...e, position: 'relative', display: 'flex', alignItems: 'center', gap: 18, paddingLeft: i % 2 ? 28 : 0 }}>
            <div style={{ position: 'absolute', left: i % 2 ? 4 : -22, top: -18, fontFamily: SANS, fontWeight: 900, fontSize: 84, color: brand.accent, opacity: 0.12 }}>{i + 1}</div>
            <div style={{ flex: 'none', width: 14, height: 14, borderRadius: '50%', background: brand.accent }} />
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: fs, color: brand.primary, lineHeight: 1.25 }}>{r.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function TableC({ c, seg, fps, brand }) {
  const frame = useCurrentFrame();
  const rows = (c.rows || []).slice(0, 6);
  const times = itemFrames(rows.length, seg.frameCount, fps);
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: 14, overflow: 'hidden' }}>
      {rows.map((row, i) => {
        const e = entrance('rise', frame, times[i], fps, 320); const head = i === 0;
        return (
          <div key={i} style={{ ...e, display: 'flex', background: head ? brand.primary : (i % 2 ? '#FFFFFF' : brand.panel) }}>
            {(Array.isArray(row) ? row : [row]).map((cell, j) => (
              <div key={j} style={{ flex: 1, padding: '15px 20px', fontFamily: SANS, fontSize: head ? 24 : 23, fontWeight: head ? 600 : 400, color: head ? '#fff' : brand.ink, fontVariantNumeric: 'tabular-nums', borderLeft: j ? `1px solid ${head ? 'rgba(255,255,255,.15)' : brand.border}` : 'none' }}>{cell}</div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// number + a proportional fill bar (numbers need visual weight)
function StatCallout({ c, fps, brand, kind, durMs }) {
  const frame = useCurrentFrame();
  const settle = ms2f(c.enter_at_ms || 120, fps);
  const e = entrance('pop', frame, settle, fps, durMs);
  const barW = interpolate(frame, [settle, settle + ms2f(500, fps)], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ ...e }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 116, color: brand.accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
      <div style={{ height: 10, borderRadius: 6, background: brand.border, marginTop: 14, overflow: 'hidden' }}>
        <div style={{ width: `${barW}%`, height: '100%', background: brand.accent }} />
      </div>
      {c.label && <div style={{ fontFamily: SANS, fontSize: 28, color: brand.slate, marginTop: 12 }}>{c.label}</div>}
    </div>
  );
}

function Diagram({ c, fps, brand, kind, durMs }) {
  const frame = useCurrentFrame();
  const e = entrance(kind, frame, ms2f(120, fps), fps, durMs);
  return (
    <div style={{ ...e, background: brand.panel, border: `1px solid ${brand.border}`, borderRadius: 16, padding: '26px 30px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: brand.periwinkle, flex: 'none' }} />
      <div style={{ fontFamily: SANS, fontSize: 26, color: brand.primary, fontWeight: 500, lineHeight: 1.35 }}>{c.label || c.shape || ''}</div>
    </div>
  );
}

function GenericCard({ c, fps, brand, kind, durMs }) {
  const frame = useCurrentFrame();
  const e = entrance(kind, frame, ms2f(c.enter_at_ms || 120, fps), fps, durMs);
  return <div style={{ ...e, fontFamily: SANS, fontSize: 28, color: brand.ink, background: brand.panel, border: `1px solid ${brand.border}`, borderRadius: 14, padding: 28 }}>{c.title || c.text || ''}</div>;
}

function Annotation({ c, seg, fps, brand, mode, chartAnchor }) {
  const frame = useCurrentFrame();
  const settle = ms2f(c.enter_at_ms || 200, fps);
  const s = interpolate(frame, [Math.max(0, settle - ms2f(260, fps)), settle], [0.75, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)) });
  const o = interpolate(frame, [Math.max(0, settle - ms2f(260, fps)), settle], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  let boxL = 0, boxT = 0, boxW = CANVAS_W, boxH = CANVAS_H;
  if (mode === 'chart_inset') { const sc = INSET_SCALE_DEFAULT; const c2 = resolveCentre({ anchor: chartAnchor }, sc); boxW = sc*CANVAS_W; boxH = sc*CANVAS_H; boxL = c2.cx - boxW/2; boxT = c2.cy - boxH/2; }
  const x = boxL + (c.x ?? 0.5) * boxW, y = boxT + (c.y ?? 0.5) * boxH;
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) scale(${s})`, opacity: o, pointerEvents: 'none' }}>
      <div style={{ background: brand.accent, color: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: mode === 'chart_inset' ? 20 : 30, padding: '8px 16px', borderRadius: 10, whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(192,83,31,0.35)' }}>{c.label}</div>
    </div>
  );
}

function BrandBug({ brand }) {
  return <div style={{ position: 'absolute', bottom: 34, right: 44, fontFamily: SANS, fontWeight: 700, fontSize: 26, color: brand.primary, opacity: 0.3 }}>PipsGravity</div>;
}

function OutroCTA({ c, seg, fps, brand }) {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const h = entrance('rise', frame, ms2f(120, fps), fps, 600);
  const btn = entrance('pop', frame, ms2f(c.enter_at_ms || 600, fps), fps, 420);
  return (
    <AbsoluteFill style={{ background: brand.primary, justifyContent: 'center', alignItems: 'center', opacity: fadeIn }}>
      <div style={{ position: 'absolute', top: '-12%', left: '-6%', width: 1200, height: 1200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,83,31,0.18) 0%, rgba(192,83,31,0) 60%)' }} />
      <div style={{ textAlign: 'center', padding: '0 200px', maxWidth: 1500 }}>
        <div style={{ ...h, fontFamily: SANS, fontWeight: 900, fontSize: 76, color: '#fff', lineHeight: 1.12, letterSpacing: '-0.02em' }}>{c.headline}</div>
        {c.button && <div style={{ ...btn, display: 'inline-block', marginTop: 36, background: brand.accent, color: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 36, padding: '18px 40px', borderRadius: 14 }}>{c.button}</div>}
        {c.link && <div style={{ ...btn, fontFamily: SANS, fontSize: 28, color: '#AEBBD2', marginTop: 22 }}>{c.link}</div>}
      </div>
      {seg.audio_url && <Audio src={seg.audio_url} />}
      {seg.captions && seg.captions.length > 0 && <Captions captions={seg.captions} fps={fps} brand={brand} />}
    </AbsoluteFill>
  );
}

function ChartLayer({ seg, srcUrl, fps, cam, mode }) {
  const frame = useCurrentFrame();
  const chart = seg.chart || {};
  let scale, cx, cy;
  if (cam && cam.from && cam.to) {
    const dur = Math.min(ms2f(cam.duration_ms || 700, fps), seg.frameCount);
    const t = interpolate(frame, [0, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
    const sFrom = cam.from.scale ?? INSET_SCALE_DEFAULT, sTo = cam.to.scale ?? 1;
    const from = resolveCentre(cam.from, sFrom), to = resolveCentre(cam.to, sTo);
    scale = sFrom + (sTo - sFrom) * t; cx = from.cx + (to.cx - from.cx) * t; cy = from.cy + (to.cy - from.cy) * t;
  } else if (mode === 'chart_full') { scale = 1; cx = CANVAS_W/2; cy = CANVAS_H/2; }
  else { const s = chart.scale || INSET_SCALE_DEFAULT; const c = resolveCentre({ anchor: chart.anchor }, s); scale = s; cx = c.cx; cy = c.cy; }

  const playing = mode === 'chart_full' && chart.state !== 'frozen';
  const inset = scale < 0.95;
  // Ken Burns drift on the frozen inset (cinematic, not flat)
  const kb = (!playing && inset) ? 1 + 0.03 * (interpolate(frame, [0, seg.frameCount], [0, 1], { extrapolateRight: 'clamp' })) : 1;
  return (
    <AbsoluteFill style={{ transform: transformStr(scale, cx, cy), transformOrigin: 'center center' }}>
      <AbsoluteFill style={{ borderRadius: inset ? 20 : 0, overflow: 'hidden', boxShadow: inset ? '0 20px 60px rgba(11,30,64,0.25)' : 'none', border: inset ? '2px solid #14315F' : 'none', background: '#FFFFFF' }}>
        <AbsoluteFill style={{ transform: `scale(${kb})` }}>
          {playing ? (
            <Video src={srcUrl} trimBefore={ms2f((chart.play_from||0)*1000, fps)} trimAfter={ms2f((chart.play_to||0)*1000, fps)} muted objectFit="contain" style={fillVid} />
          ) : chart.freeze_frame_url ? (
            <Img src={chart.freeze_frame_url} style={fill} />
          ) : (
            <Freeze frame={ms2f((chart.freeze_at||0)*1000, fps)}><Video src={srcUrl} muted objectFit="contain" style={fillVid} /></Freeze>
          )}
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── Captions: ~6-word chunks, stroke for legibility, keyword highlight sweep ──
function Captions({ captions, fps, brand }) {
  const frame = useCurrentFrame();
  const sec = frame / fps;
  const chunks = []; let cur = [];
  captions.forEach(cap => { cur.push(cap); const brk = /[.,!?;]$/.test(cap.word); if ((brk && cur.length >= 3) || cur.length >= 6) { chunks.push(cur); cur = []; } });
  if (cur.length) chunks.push(cur);
  let active = 0; chunks.forEach((ch, i) => { if (sec >= ch[0].start) active = i; });
  const chunk = chunks[active] || [];
  if (!captions.length || sec < captions[0].start) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', bottom: 56, left: 96, right: 96, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 10px', maxWidth: '86%' }}>
          {chunk.map((cap, i) => {
            const on = sec >= cap.start && sec < cap.end;
            const past = sec >= cap.end;
            const sweep = on ? interpolate(sec, [cap.start, cap.start + Math.min(0.25, Math.max(0.08, cap.end - cap.start))], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : (past ? 1 : 0);
            return (
              <span key={i} style={{ position: 'relative', display: 'inline-block', fontFamily: SANS, fontSize: 46, fontWeight: 800,
                color: on ? '#FFFFFF' : (past ? '#FFFFFF' : '#FFFFFF'), opacity: past ? 0.55 : 1,
                textShadow: '0 2px 8px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.9)' }}>
                {/* copper highlight sweep behind the active/keyword word */}
                <span style={{ position: 'absolute', left: -4, right: -4, top: 6, bottom: 6, background: brand.accent, opacity: on || past ? 0.9 : 0, transform: `scaleX(${sweep})`, transformOrigin: 'left center', borderRadius: 4, zIndex: 0 }} />
                <span style={{ position: 'relative', zIndex: 1 }}>{cap.word}</span>
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function LegacySegment({ seg, srcUrl, fps, brand }) {
  if (seg.type === 'live') return <AbsoluteFill><Video src={srcUrl} trimBefore={Math.round(seg.start_time*fps)} trimAfter={Math.round(seg.end_time*fps)} muted objectFit="contain" style={fillVid} /></AbsoluteFill>;
  return (
    <AbsoluteFill>
      {seg.freeze_frame_url ? <Img src={seg.freeze_frame_url} style={fill} /> : <Freeze frame={Math.round(seg.timestamp*fps)}><Video src={srcUrl} muted objectFit="contain" style={fillVid} /></Freeze>}
      {seg.audio_url && <Audio src={seg.audio_url} />}
      {seg.captions && seg.captions.length > 0 && <Captions captions={seg.captions} fps={fps} brand={brand} />}
    </AbsoluteFill>
  );
}