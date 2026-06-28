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
import { AbsoluteFill, Freeze, Img, Sequence, interpolate, Easing, useCurrentFrame, useVideoConfig, useCurrentScale, delayRender, continueRender } from 'remotion';
import { Video, Audio } from '@remotion/media';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';
import { fitText, measureText } from '@remotion/layout-utils';
import { scaleLinear } from 'd3';

// Load ONLY the weights/subset we actually use. Default loadFont() pulls every
// weight + italic (~96 network requests per render tab) which slows startup badly
// across the parallel tabs. Restricting cuts it to a handful of requests per tab.
const { fontFamily: POPPINS } = loadPoppins('normal', { weights: ['400', '500', '600', '700', '800', '900'], subsets: ['latin'] });
const { fontFamily: MONO }    = loadJetBrainsMono('normal', { weights: ['400', '600', '700'], subsets: ['latin'] });
const SANS  = `${POPPINS}, 'Noto Color Emoji', sans-serif`;
const MONOS = `${MONO}, 'Noto Color Emoji', monospace`;

const CANVAS_W = 1920, CANVAS_H = 1080;
const MARGIN = 110, TOP = 130, BOTTOM = 905;
const DEBUG_ZONE = false;       // flip true for a diagnostic render: draws the graphics-zone border
const FIT_MARGIN = 0.94;        // fit content to 94% of the zone so estimate error can't reach the clip edge
const BGM_VOLUME = 0.1, INSET_MARGIN = 0.05, INSET_SCALE_DEFAULT = 0.42;

const ms2f = (ms, fps) => Math.round(((ms || 0) / 1000) * fps);

// Best-practice text fitting (@remotion/layout-utils): size text to the available
// width instead of guessing. Defensive — falls back to `base` if measurement fails
// (e.g. fonts not yet loaded), so a render can never break on it.
function fitSize(text, withinWidth, fontWeight, base, max) {
  try {
    const { fontSize } = fitText({ text: String(text || ''), withinWidth, fontFamily: POPPINS, fontWeight, textTransform: 'none' });
    return Math.max(Math.round(base * 0.7), Math.min(max, Math.floor(fontSize)));
  } catch (e) {
    return base;
  }
}

const brandOf = (b = {}) => ({
  background: b.background || '#FFFFFF', ink: b.ink || '#1B2330', primary: b.primary || '#14315F',
  accent: b.accent || '#C0531F', slate: b.slate || '#5B6471', panel: b.panel || '#F6F8FB',
  periwinkle: '#6E86C9', border: '#E6E9EF',
  // semantic candle colours (universal trading convention) — used by the SMC primitives
  bull: '#1F9D6B', bear: '#D2384F', grid: 'rgba(20,33,48,0.05)',
});

const fill = { width: '100%', height: '100%', objectFit: 'contain' };
const fillVid = { width: '100%', height: '100%' };

// ── varied entrance library ──────────────────────────────────────────────────
const ENTRANCES = ['rise', 'slideL', 'pop', 'slideR', 'blur', 'spread'];
function entrance(kind, frame, settleF, fps, durMs = 420) {
  // guarantee a strictly-increasing range — a settle of 0 (enter_at_ms:0) must never make [0,0]
  const end = Math.max(1, settleF);
  const start = Math.max(0, end - Math.max(1, ms2f(durMs, fps)));
  const ease = kind === 'pop' ? Easing.bezier(0.34, 1.56, 0.64, 1) : Easing.bezier(0.16, 1, 0.3, 1);
  const t = interpolate(frame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  if (kind === 'blur')   return { opacity: t, filter: `blur(${(1 - t) * 10}px)` };
  if (kind === 'spread') return { opacity: t, letterSpacing: `${(1 - t) * 0.12}em` };
  let tf;
  if (kind === 'slideL') tf = `translateX(${(1 - t) * -46}px)`;
  else if (kind === 'slideR') tf = `translateX(${(1 - t) * 46}px)`;
  else if (kind === 'pop') tf = `scale(${0.86 + 0.14 * t})`;
  else tf = `translateY(${(1 - t) * 26}px)`;
  return { opacity: t, transform: tf };
}
// kinetic typography — the WORDS themselves animate in (staggered), not just the block.
function KineticText({ text, settleMs = 0, fps, kind = 'rise', perWordMs = 65, durMs = 340, style }) {
  const frame = useCurrentFrame();
  const words = String(text || '').split(/\s+/).filter(Boolean);
  return (
    <span style={{ display: 'inline' }}>
      {words.map((w, i) => {
        const a = entrance(kind, frame, ms2f(settleMs + i * perWordMs, fps), fps, durMs);
        return <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', ...a, ...style }}>{w}{i < words.length - 1 ? ' ' : ''}</span>;
      })}
    </span>
  );
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
  if (Array.isArray(provided) && provided.length === count && provided.every(t => t != null)) return provided.map(t => Math.max(1, ms2f(t, fps)));
  const first = ms2f(150, fps), last = Math.max(first, Math.floor(segFrames * 0.62));
  if (count <= 1) return [first];
  return Array.from({ length: count }, (_, i) => Math.round(first + (last - first) * (i / (count - 1))));
}

// ── chart geometry = single source of truth ─────────────────────────────────
// Where the chart RESTS in this segment (its settled state), in px.
function chartFinalBox(seg, cam, mode) {
  if (mode === 'graphics') return null;
  let scale, centre;
  if (cam && cam.to) {
    scale = cam.to.scale ?? (mode === 'chart_full' ? 1 : INSET_SCALE_DEFAULT);
    centre = resolveCentre(cam.to, scale);
  } else {
    const chart = seg.chart || {};
    scale = mode === 'chart_full' ? 1 : (chart.scale || INSET_SCALE_DEFAULT);
    centre = resolveCentre({ anchor: chart.anchor }, scale);
  }
  const w = scale * CANVAS_W, h = scale * CANVAS_H;
  return { left: centre.cx - w / 2, top: centre.cy - h / 2, width: w, height: h, scale };
}

// Graphics zone = the largest empty rectangle NOT covered by the chart.
function graphicsZone(mode, chartBox) {
  if (mode === 'graphics' || !chartBox) return { left: 150, top: TOP, width: CANVAS_W - 300, height: BOTTOM - TOP };
  if (chartBox.scale >= 0.95) return null; // chart fills frame → no graphics
  const PAD = 46;
  const cxRatio = (chartBox.left + chartBox.width / 2) / CANVAS_W;
  if (cxRatio > 0.55) { // chart on the right → graphics on the left
    const right = chartBox.left - PAD;
    return { left: MARGIN, top: TOP, width: Math.max(220, right - MARGIN), height: BOTTOM - TOP };
  }
  if (cxRatio < 0.45) { // chart on the left → graphics on the right
    const left = chartBox.left + chartBox.width + PAD;
    return { left, top: TOP, width: Math.max(220, CANVAS_W - MARGIN - left), height: BOTTOM - TOP };
  }
  // chart centred → graphics in the band above it
  const bottom = chartBox.top - PAD;
  return { left: MARGIN, top: TOP, width: CANVAS_W - 2 * MARGIN, height: Math.max(180, bottom - TOP) };
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

// Draft "graphics world": engineering line-grid, radially masked, + soft vignette.
// Brand-pure (navy hairlines on white) — borrows the technique from the reference HTML, not its colours.
function World({ brand }) {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 120% at 50% 8%, ${brand.background} 0%, #F1F4F8 60%, #E9EDF3 100%)` }}>
      {/* line grid, masked to the centre so edges fall away */}
      <AbsoluteFill style={{
        backgroundImage: `linear-gradient(${brand.grid} 1px, transparent 1px), linear-gradient(90deg, ${brand.grid} 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
        WebkitMaskImage: 'radial-gradient(120% 90% at 50% 45%, #000 58%, transparent 100%)',
        maskImage: 'radial-gradient(120% 90% at 50% 45%, #000 58%, transparent 100%)',
      }} />
      {/* corner vignette for depth */}
      <AbsoluteFill style={{ background: 'radial-gradient(130% 110% at 50% 50%, transparent 62%, rgba(20,33,48,0.05) 100%)' }} />
    </AbsoluteFill>
  );
}

function SegmentView({ seg, srcUrl, fps, brand, cam, isLegacy }) {
  const frame = useCurrentFrame();
  if (isLegacy) return <LegacySegment seg={seg} srcUrl={srcUrl} fps={fps} brand={brand} />;

  const mode = seg.canvas_mode || 'graphics';
  const showChart = mode !== 'graphics' && seg.chart && seg.chart.visible !== false;
  const comps = seg.components || [];
  // CTA full-screen only on actual cta/outro scenes — never lets a stray outro_cta
  // hijack a chart/practice segment (the "Execute This With Confidence" bug).
  const outro = comps.find(c => c.type === 'outro_cta');
  if (outro && (seg.phase === 'outro' || seg.phase === 'cta')) return <OutroCTA c={outro} seg={seg} fps={fps} brand={brand} />;

  // C6: on-chart annotation labels are removed (inaccurate + violate the layout rule).
  let flow = comps.filter(c => !['outro_cta', 'annotation', 'brand_bug'].includes(c.type));
  // HOOK never renders near-blank: if only text was given, inject one animated graphic.
  if (seg.phase === 'hook' && mode === 'graphics' && !flow.some(c => GRAPHIC_TYPES.includes(c.type))) {
    flow = [...flow, { type: 'candle_cluster', bias: seg.chart_bias || 'Bearish', _auto: true, enter_at_ms: 200 }];
  }
  // One chart graphic per scene (one focal chart) — drop extra chart components.
  const CHART_TYPES = ['chart_concept', 'candle_cluster', 'zone_box', 'liquidity_run', 'fvg', 'structure_break', 'trade_plan'];
  let seenChart = false;
  flow = flow.filter(c => { if (CHART_TYPES.includes(c.type)) { if (seenChart) return false; seenChart = true; } return true; });
  // C4: one focal point — keep at most 3 elements, highest importance first (stable order).
  if (flow.length > 3) {
    const keep = flow.map((c, i) => i)
      .sort((a, b) => (IMPORTANCE_RANK[flow[a].importance] ?? 1) - (IMPORTANCE_RANK[flow[b].importance] ?? 1) || a - b)
      .slice(0, 3).sort((a, b) => a - b);
    flow = keep.map(i => flow[i]);
  }
  const chartBox = chartFinalBox(seg, cam, mode);
  const chartAnchor = (seg.chart && seg.chart.anchor) || (cam && cam.to && cam.to.anchor) || 'center_right';
  const zone = graphicsZone(mode, chartBox);
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // When the chart zooms (camera present), hold graphics back until it settles into the inset.
  const settleF = (cam && cam.from && cam.to) ? Math.min(ms2f(cam.duration_ms || 700, fps), seg.frameCount) : 0;
  const gZone = zone && (mode === 'graphics' || frame >= settleF * 0.55) ? zone : null;

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {mode === 'graphics' && <BackgroundTreatment flow={flow} seg={seg} fps={fps} brand={brand} />}
      {showChart && <ChartLayer seg={seg} srcUrl={srcUrl} fps={fps} cam={cam} mode={mode} />}
      {gZone && flow.length > 0 && <GraphicsStack flow={flow} seg={seg} fps={fps} brand={brand} zone={gZone} settleF={settleF} />}
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

// motion-graphic (non-text) primitive types
const GRAPHIC_TYPES = ['chart_concept', 'candle_cluster', 'zone_box', 'liquidity_run', 'flow_steps', 'arrow', 'diagram', 'crowd', 'fvg', 'structure_break', 'trade_plan'];

// rough intrinsic heights (px) so the stack can auto-fit without DOM measurement
function estHeight(c) {
  if (c.type === 'roadmap' || c.type === 'concept_list') { const n = (c.items || c.rows || []).length || 3; return 50 + n * 70; }
  if (c.type === 'table') { const n = (c.rows || []).length || 3; return n * 62; }
  if (c.type === 'flow_steps') { const n = (c.steps || c.items || []).length || 4; return n > 4 ? 470 : 300; }
  const H = { hook_text: 240, heading: 150, concept_card: 250, callback_card: 200, stat_callout: 240,
    chart_concept: 460, candle_cluster: 460, zone_box: 460, liquidity_run: 460, flow_steps: 300, arrow: 120, diagram: 140,
    crowd: 210, fvg: 460, structure_break: 460, trade_plan: 460 };
  return H[c.type] || 150;
}
// Real measured height for text-heavy cards (best practice — measure, don't guess),
// so the stack's fit-scale knows the true height and never overflows. Falls back to estHeight.
function measuredHeight(c, width) {
  try {
    const avail = Math.max(220, width - 100);
    const lines = (text, fs, fw) => text ? Math.max(1, Math.ceil(measureText({ text: String(text), fontFamily: POPPINS, fontSize: fs, fontWeight: fw }).width / avail)) : 0;
    if (c.type === 'concept_card') return 84 + lines(c.title, 56, '700') * 66 + (c.title && c.body ? 18 : 0) + lines(c.body, 40, '400') * 56;
    if (c.type === 'callback_card') return 68 + 48 + lines(c.title, 50, '700') * 60 + lines(c.body, 38, '400') * 53;
  } catch (e) {}
  return estHeight(c);
}
const IMPORTANCE_RANK = { critical: 0, primary: 1, secondary: 2 };

// Fitted top-anchored stack: never clips (auto-scales to fit), never jams (slot per item),
// vertically centred when it fits. Replaces the old centre+overflow:hidden approach.
function GraphicsStack({ flow, seg, fps, brand, zone, settleF }) {
  const kf = useCurrentFrame();
  const scaleC = useCurrentScale();
  const stackRef = React.useRef(null);
  const [measured, setMeasured] = React.useState(null);
  const [delayHandle] = React.useState(() => delayRender('measure-graphics-stack'));
  const gap = flow.length >= 4 ? 18 : 28;
  // pre-measure estimate (text-measured); replaced below by the REAL rendered height
  const est = flow.reduce((a, c) => a + measuredHeight(c, zone.width), 0) + gap * Math.max(0, flow.length - 1);
  const estFit = Math.min(1, (zone.height * FIT_MARGIN) / Math.max(1, est));
  // Measure the ACTUAL rendered stack height (getBoundingClientRect ÷ useCurrentScale, undo estFit)
  // and fit to it — guarantees the stack never overflows, regardless of estimate error.
  React.useEffect(() => {
    try {
      if (stackRef.current) {
        const natural = stackRef.current.getBoundingClientRect().height / (scaleC || 1) / Math.max(0.001, estFit);
        if (natural > 0 && isFinite(natural)) setMeasured(natural);
      }
    } catch (e) {}
    continueRender(delayHandle);
  }, []);
  const fitScale = measured ? Math.min(1, (zone.height * FIT_MARGIN) / Math.max(1, measured)) : estFit;
  const usedH = (measured || est) * fitScale;
  const offsetY = Math.max(0, (zone.height - usedH) / 2);
  const settleMs = settleF ? (settleF / fps) * 1000 : 0;
  // importance tiering: components without an explicit enter time animate in importance order
  // (critical → primary → secondary), but keep their visual stacking order stable.
  const autoIdx = flow.map((c, i) => i).filter(i => flow[i].enter_at_ms == null)
    .sort((a, b) => (IMPORTANCE_RANK[flow[a].importance] ?? 1) - (IMPORTANCE_RANK[flow[b].importance] ?? 1) || a - b);
  const autoTime = {}; autoIdx.forEach((idx, k) => { autoTime[idx] = 150 + k * 420; });
  return (
    <div style={{ position: 'absolute', left: zone.left, top: zone.top, width: zone.width, height: zone.height, overflow: 'visible', ...(DEBUG_ZONE ? { outline: '4px solid red' } : {}) }}>
      {DEBUG_ZONE && (
        <div style={{ position: 'absolute', top: 2, left: 6, fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#c00', background: 'rgba(255,255,255,0.8)', padding: '2px 8px', zIndex: 99999, whiteSpace: 'nowrap' }}>
          {`${seg.canvas_mode}/${seg.phase} | zone ${Math.round(zone.width)}x${Math.round(zone.height)} | est ${Math.round(est)} | meas ${measured ? Math.round(measured) : '-'} | fit ${fitScale.toFixed(2)} | n ${flow.length} [${flow.map(c => c.type).join(',')}]`}
        </div>
      )}
      <div ref={stackRef} style={{ position: 'absolute', top: offsetY, left: 0, width: '100%', transform: `scale(${fitScale})`, transformOrigin: '50% 0',
        display: 'flex', flexDirection: 'column', gap, alignItems: 'stretch' }}>
        {flow.map((c, i) => {
          const baseEnter = (c.enter_at_ms == null) ? autoTime[i] : c.enter_at_ms;
          const cc = { ...c, enter_at_ms: baseEnter + settleMs };
          // keep-alive: every element keeps a subtle idle; the focal element gets a gentle ~3s pulse.
          const idleY = Math.sin((kf / fps) * 0.85 + i * 1.4) * 2.5;
          const emph = i === 0 ? 1 + 0.012 * Math.sin((((kf / fps) % 3) / 3) * Math.PI) : 1;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', transform: `translateY(${idleY}px) scale(${emph})`, transformOrigin: 'center' }}>
              <FlowComponent c={cc} idx={i} seg={seg} fps={fps} brand={brand} zoneW={zone.width * fitScale} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FlowComponent({ c, idx, seg, fps, brand, zoneW }) {
  const kind = ENTRANCES[idx % ENTRANCES.length];
  const heroDur = idx === 0 ? 640 : 320;             // vary speed: first slow, rest fast
  const p = { c, idx, seg, fps, brand, kind, durMs: heroDur, zoneW };
  switch (c.type) {
    case 'hook_text':      return <HookText {...p} />;
    case 'heading':        return <Heading {...p} />;
    case 'concept_card':   return <ConceptCard {...p} />;
    case 'callback_card':  return <CallbackCard {...p} />;
    case 'roadmap':
    case 'concept_list':   return <Roadmap {...p} />;
    case 'table':          return <TableC {...p} />;
    case 'stat_callout':   return <StatCallout {...p} />;
    // ── chart graphics → ONE coherent D3 ChartConcept (replaces the 6 primitives) ──
    case 'chart_concept':
    case 'candle_cluster':
    case 'zone_box':
    case 'liquidity_run':
    case 'fvg':
    case 'structure_break':
    case 'trade_plan':     return <ChartConcept {...p} />;
    // ── other motion-graphic primitives ──
    case 'flow_steps':     return <FlowSteps {...p} />;
    case 'arrow':          return <ArrowMark {...p} />;
    case 'crowd':          return <Crowd {...p} />;
    case 'diagram':        return <Diagram {...p} />;
    default:               return <GenericCard {...p} />;
  }
}

function HookText({ c, fps, brand, zoneW }) {
  const base = c.enter_at_ms || 60;
  const fs = fitSize(c.primary, (zoneW || 1500) * 0.96, 900, 104, 140);
  return (
    <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: fs, lineHeight: 1.06, letterSpacing: '-0.03em' }}>
      <div style={{ color: brand.primary }}><KineticText text={c.primary} settleMs={base} fps={fps} kind="rise" perWordMs={85} durMs={460} /></div>
      {c.secondary && <div style={{ color: brand.accent, fontSize: Math.round(fs * 0.62) }}><KineticText text={c.secondary} settleMs={base + 360} fps={fps} kind="rise" perWordMs={70} durMs={420} /></div>}
    </div>
  );
}

function ConceptCard({ c, fps, brand, kind, durMs }) {
  const frame = useCurrentFrame();
  const card = entrance(kind, frame, ms2f(120, fps), fps, durMs);
  const body = entrance('rise', frame, ms2f(c.enter_at_ms || 500, fps), fps, 360);
  return (
    <div style={{ ...card, background: '#FFFFFF', border: `1px solid ${brand.border}`, borderRadius: 24, padding: '42px 50px', boxShadow: '0 14px 40px rgba(11,30,64,0.07)' }}>
      {c.title && <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 56, color: brand.primary, marginBottom: 18 }}>{c.title}</div>}
      {c.screenshot_ref_url && <Img src={c.screenshot_ref_url} style={{ width: '100%', borderRadius: 10, border: '1px solid #CDD4DF', marginBottom: 16 }} />}
      {c.body && <div style={{ ...body, fontFamily: SANS, fontWeight: 400, fontSize: 40, lineHeight: 1.4, color: brand.ink }}>{c.body}</div>}
    </div>
  );
}

// redesigned: no left-edge stripe (AI tell) — a copper "RECALL" chip on top instead
function CallbackCard({ c, fps, brand, kind, durMs }) {
  const frame = useCurrentFrame();
  const card = entrance(kind, frame, ms2f(120, fps), fps, durMs);
  const body = entrance('rise', frame, ms2f(c.enter_at_ms || 500, fps), fps, 360);
  return (
    <div style={{ ...card, background: brand.panel, border: `1px solid ${brand.border}`, borderRadius: 20, padding: '34px 40px' }}>
      <div style={{ display: 'inline-block', background: brand.accent, color: '#fff', fontFamily: MONOS, fontSize: 26, fontWeight: 600, padding: '6px 16px', borderRadius: 8, marginBottom: 18 }}>{c.tag || 'RECALL'}</div>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 50, color: brand.primary }}>{c.title}</div>
      {c.body && <div style={{ ...body, fontFamily: SANS, fontSize: 38, color: brand.ink, marginTop: 14, lineHeight: 1.38 }}>{c.body}</div>}
    </div>
  );
}

// drawn-icon rows + chip number badge (no emoji ☐ boxes, no overlapping ghost numerals)
const stripEmoji = s => String(s || '').replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2022}]/gu, '').replace(/^\s*[-•☐☑☒]\s*/, '').trim();
function Roadmap({ c, seg, fps, brand }) {
  const frame = useCurrentFrame();
  const rows = (c.items || c.rows || []).slice(0, 6).map(r => typeof r === 'string' ? { label: r } : r);
  const times = itemFrames(rows.length, seg.frameCount, fps, rows.map(r => r.enter_at_ms));
  const fs = rows.length >= 6 ? 40 : rows.length >= 5 ? 46 : 52;
  const fallbackIcons = ['choch', 'order_block', 'liquidity', 'sweep', 'entry', 'check'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: rows.length >= 5 ? 22 : 28 }}>
      {rows.map((r, i) => {
        const e = entrance('slideL', frame, times[i], fps, 360);
        const label = stripEmoji(r.label || r.title);
        return (
          <div key={i} style={{ ...e, display: 'flex', alignItems: 'center', gap: 26 }}>
            <div style={{ flex: 'none', width: 72, height: 72, borderRadius: 16, background: brand.panel, border: `1px solid ${brand.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <Icon name={r.icon || fallbackIcons[i % fallbackIcons.length]} color={brand.accent} size={40} />
              <div style={{ position: 'absolute', top: -10, left: -10, width: 30, height: 30, borderRadius: '50%', background: brand.primary, color: '#fff',
                fontFamily: SANS, fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: fs, color: brand.primary, lineHeight: 1.22 }}>{label}</div>
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
              <div key={j} style={{ flex: 1, padding: '22px 30px', fontFamily: SANS, fontSize: head ? 38 : 34, fontWeight: head ? 600 : 400, color: head ? '#fff' : brand.ink, fontVariantNumeric: 'tabular-nums', borderLeft: j ? `1px solid ${head ? 'rgba(255,255,255,.15)' : brand.border}` : 'none' }}>{cell}</div>
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
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 168, color: brand.accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
      <div style={{ height: 16, borderRadius: 8, background: brand.border, marginTop: 18, overflow: 'hidden' }}>
        <div style={{ width: `${barW}%`, height: '100%', background: brand.accent }} />
      </div>
      {c.label && <div style={{ fontFamily: SANS, fontSize: 44, color: brand.slate, marginTop: 16 }}>{c.label}</div>}
    </div>
  );
}

function Diagram({ c, fps, brand, kind, durMs }) {
  const frame = useCurrentFrame();
  const e = entrance(kind, frame, ms2f(120, fps), fps, durMs);
  return (
    <div style={{ ...e, background: brand.panel, border: `1px solid ${brand.border}`, borderRadius: 20, padding: '32px 40px', display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: brand.periwinkle, flex: 'none' }} />
      <div style={{ fontFamily: SANS, fontSize: 42, color: brand.primary, fontWeight: 500, lineHeight: 1.3 }}>{c.label || c.shape || ''}</div>
    </div>
  );
}

function GenericCard({ c, fps, brand, kind, durMs }) {
  const frame = useCurrentFrame();
  const e = entrance(kind, frame, ms2f(c.enter_at_ms || 120, fps), fps, durMs);
  return <div style={{ ...e, fontFamily: SANS, fontSize: 42, color: brand.ink, background: brand.panel, border: `1px solid ${brand.border}`, borderRadius: 18, padding: 38 }}>{c.title || c.text || ''}</div>;
}

// section heading — sized to fill the width (fitText), words animate in
function Heading({ c, fps, brand, zoneW }) {
  const base = c.enter_at_ms || 120;
  const fs = fitSize(c.title || c.primary, (zoneW || 1500) * 0.96, 900, 96, 128);
  return (
    <div>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: fs, lineHeight: 1.08, letterSpacing: '-0.02em', color: brand.primary }}>
        <KineticText text={c.title || c.primary} settleMs={base} fps={fps} kind="rise" perWordMs={60} durMs={360} />
      </div>
      {(c.subtitle || c.secondary) && (
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: Math.round(fs * 0.5), color: brand.accent, marginTop: 16, lineHeight: 1.24 }}>
          <KineticText text={c.subtitle || c.secondary} settleMs={base + 240} fps={fps} kind="slideR" perWordMs={45} durMs={320} />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SVG ICON SET — drawn glyphs (no emoji, no ☐ boxes). Keyed by name.
// ════════════════════════════════════════════════════════════════════════════
function Icon({ name, color, size = 30 }) {
  const s = { width: size, height: size, display: 'block' };
  const st = { fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch ((name || '').toLowerCase()) {
    case 'choch': case 'break': case 'structure':
      return <svg viewBox="0 0 24 24" style={s}><path d="M3 17l5-5 4 3 5-8" {...st} /><path d="M14 7h3v3" {...st} /></svg>;
    case 'order_block': case 'orderblock': case 'block': case 'zone':
      return <svg viewBox="0 0 24 24" style={s}><rect x="4" y="6" width="16" height="9" rx="2" {...st} /><path d="M4 19h16" {...st} opacity="0.5" /></svg>;
    case 'liquidity': case 'pool': case 'liquidity_pool':
      return <svg viewBox="0 0 24 24" style={s}><path d="M12 3c4 5 6 8 6 11a6 6 0 11-12 0c0-3 2-6 6-11z" {...st} /></svg>;
    case 'sweep': case 'liquidity_sweep': case 'stab':
      return <svg viewBox="0 0 24 24" style={s}><path d="M4 12h10" {...st} /><path d="M11 8l5 4-5 4" {...st} /><path d="M19 5v14" {...st} opacity="0.5" /></svg>;
    case 'entry': case 'target': case 'aim':
      return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="8" {...st} /><circle cx="12" cy="12" r="3" {...st} /></svg>;
    case 'trap': case 'retail': case 'warning':
      return <svg viewBox="0 0 24 24" style={s}><path d="M12 4l8 14H4z" {...st} /><path d="M12 10v4" {...st} /><circle cx="12" cy="16.5" r="0.6" fill={color} stroke="none" /></svg>;
    case 'trend_up': case 'bull': case 'up':
      return <svg viewBox="0 0 24 24" style={s}><path d="M4 17l6-6 4 3 6-8" {...st} /><path d="M17 6h3v3" {...st} /></svg>;
    case 'trend_down': case 'bear': case 'down':
      return <svg viewBox="0 0 24 24" style={s}><path d="M4 7l6 6 4-3 6 8" {...st} /><path d="M17 18h3v-3" {...st} /></svg>;
    case 'candle':
      return <svg viewBox="0 0 24 24" style={s}><path d="M9 3v4M9 17v4M15 6v3M15 15v3" {...st} /><rect x="6.5" y="7" width="5" height="10" rx="1" {...st} /><rect x="12.5" y="9" width="5" height="6" rx="1" {...st} /></svg>;
    case 'eye': case 'watch': case 'see':
      return <svg viewBox="0 0 24 24" style={s}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" {...st} /><circle cx="12" cy="12" r="3" {...st} /></svg>;
    case 'check': case 'rule': case 'valid':
      return <svg viewBox="0 0 24 24" style={s}><path d="M20 6L9 17l-5-5" {...st} /></svg>;
    default:
      return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="8" {...st} /></svg>;
  }
}

// ── CandleCluster: animated candlesticks that grow in (bodies rise from baseline) ──
function buildCandles(n, bias) {
  const bear = String(bias || '').toLowerCase().includes('bear');
  const out = []; let y = bear ? 0.30 : 0.70;            // start price (0=top,1=bottom in viewBox)
  for (let i = 0; i < n; i++) {
    const reversal = i >= Math.floor(n * 0.6);             // trend then reverse (CHoCH feel)
    const drift = (bear ? (reversal ? -0.06 : 0.07) : (reversal ? 0.06 : -0.07));
    const open = y; let close = Math.min(0.86, Math.max(0.14, y + drift + (Math.sin(i * 1.7) * 0.02)));
    const up = close < open;                               // lower y = higher price = bullish candle
    const hi = Math.min(open, close) - 0.04, lo = Math.max(open, close) + 0.04;
    out.push({ open, close, hi, lo, up }); y = close;
  }
  return out;
}
function CandleCluster({ c, seg, fps, brand, durMs }) {
  const frame = useCurrentFrame();
  const W = 640, H = 320, padX = 30, padTop = 24, padBot = 24;
  const candles = (c.candles && c.candles.length) ? c.candles : buildCandles(c.count || 8, c.bias || seg.chart_bias);
  const n = candles.length, slot = (W - 2 * padX) / n, bw = Math.min(34, slot * 0.52);
  const yOf = v => padTop + v * (H - padTop - padBot);
  const base = ms2f(c.enter_at_ms || 150, fps);
  const label = c.label || c.title;
  return (
    <div style={{ width: '100%', maxWidth: 1280, alignSelf: 'center' }}>
      {label && <div style={{ fontFamily: MONOS, fontWeight: 600, fontSize: 34, letterSpacing: '0.08em', textTransform: 'uppercase', color: brand.slate, marginBottom: 10 }}>{label}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {candles.map((cd, i) => {
          const settle = base + ms2f(i * 70, fps);
          const t = interpolate(frame, [settle, settle + ms2f(240, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          if (t <= 0) return null;
          const x = padX + slot * i + slot / 2;
          const bodyTop = yOf(Math.min(cd.open, cd.close)), bodyBot = yOf(Math.max(cd.open, cd.close));
          const bh = Math.max(4, (bodyBot - bodyTop)) * t, mid = (bodyTop + bodyBot) / 2;
          const col = cd.up ? brand.bull : brand.bear;
          return (
            <g key={i} opacity={t}>
              <line x1={x} y1={yOf(cd.hi)} x2={x} y2={yOf(cd.lo)} stroke={col} strokeWidth="2.4" strokeLinecap="round" opacity={0.85} />
              <rect x={x - bw / 2} y={mid - bh / 2} width={bw} height={bh} rx="2.5" fill={col} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── ZoneBox: an order-block rectangle that draws + glows, with a label tag ──
function ZoneBox({ c, fps, brand, durMs }) {
  const frame = useCurrentFrame();
  const settle = ms2f(c.enter_at_ms || 150, fps);
  const t = interpolate(frame, [settle, settle + ms2f(360, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((frame / fps) / 1.2 * Math.PI * 2));
  const W = 600, H = 280;
  return (
    <div style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', opacity: t }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* faint candles behind for context */}
        <path d="M40 150 L120 120 L200 170 L280 130" fill="none" stroke={brand.border} strokeWidth="3" strokeLinecap="round" />
        <rect x={60} y={110} width={Math.max(1, 420 * t)} height={90} rx="8"
          fill={`rgba(192,83,31,${0.12 * glow})`} stroke={brand.accent} strokeWidth="2.4" />
        <g transform="translate(60,84)" opacity={t}>
          <rect x="0" y="-22" width={c.label ? 12 + (c.label.length) * 13 : 140} height="34" rx="8" fill={brand.accent} />
          <text x="14" y="1" fontFamily={MONO} fontSize="20" fontWeight="700" fill="#fff" dominantBaseline="middle">{c.label || 'ORDER BLOCK'}</text>
        </g>
      </svg>
    </div>
  );
}

// ── LiquidityRun: dashed liquidity level + a sweep arrow that stabs through & snaps back ──
function LiquidityRun({ c, fps, brand, durMs }) {
  const frame = useCurrentFrame();
  const settle = ms2f(c.enter_at_ms || 150, fps);
  const draw = interpolate(frame, [settle, settle + ms2f(300, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  // sweep: price stabs above the level then snaps down (the trap)
  const sw = interpolate(frame, [settle + ms2f(420, fps), settle + ms2f(760, fps), settle + ms2f(1100, fps)], [0, 1, 0.55],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const W = 600, H = 280, levelY = 120, stabX = 360;
  const stabTop = levelY - 70 * sw;
  return (
    <div style={{ width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <line x1={40} y1={levelY} x2={40 + (W - 80) * draw} y2={levelY} stroke={brand.periwinkle} strokeWidth="3" strokeDasharray="8 7" />
        <g opacity={draw}>
          <rect x="40" y={levelY - 30} width="150" height="26" rx="6" fill={brand.primary} />
          <text x="52" y={levelY - 12} fontFamily={MONO} fontSize="17" fontWeight="700" fill="#fff">{c.label || 'LIQUIDITY'}</text>
        </g>
        {/* the stab + snap */}
        <line x1={stabX} y1={levelY + 40} x2={stabX} y2={stabTop} stroke={brand.bear} strokeWidth="6" strokeLinecap="round" />
        <path d={`M${stabX - 12} ${stabTop + 14} L${stabX} ${stabTop} L${stabX + 12} ${stabTop + 14}`} fill="none" stroke={brand.bear} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity={sw} />
      </svg>
    </div>
  );
}

// ── FlowSteps: numbered step cards with drawn icons. Shows ALL steps (wraps to 2 rows > 4) ──
function FlowSteps({ c, fps, brand }) {
  const frame = useCurrentFrame();
  const steps = (c.steps || c.items || []).map(s => typeof s === 'string' ? { label: s } : s);
  if (!steps.length) return null;
  const n = steps.length, wrap = n > 4, perRow = wrap ? Math.ceil(n / 2) : n;
  const basis = `calc(${(100 / perRow).toFixed(2)}% - 16px)`;
  const compact = wrap || n >= 4;
  const ib = compact ? 64 : 88, ic = compact ? 36 : 48, lf = compact ? 24 : 32, sf = compact ? 18 : 24, bd = compact ? 40 : 48;
  const base = ms2f(c.enter_at_ms || 150, fps);
  const fallback = ['choch', 'order_block', 'liquidity', 'sweep', 'entry', 'check', 'trend_up', 'candle'];
  return (
    <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', gap: 16 }}>
      {steps.map((s, i) => {
        const settle = base + ms2f(160 + i * 190, fps);
        const e = entrance('pop', frame, settle, fps, 420);
        return (
          <div key={i} style={{ ...e, position: 'relative', flex: `1 1 ${basis}`, maxWidth: basis, boxSizing: 'border-box', background: '#fff', border: `1.5px solid ${brand.border}`, borderRadius: 20,
            boxShadow: '0 12px 30px rgba(11,30,64,0.08)', padding: compact ? '24px 16px' : '32px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
            <div style={{ position: 'absolute', top: -bd * 0.42, left: -bd * 0.34, width: bd, height: bd, borderRadius: '50%', background: brand.accent, color: '#fff',
              fontFamily: SANS, fontWeight: 800, fontSize: Math.round(bd * 0.46), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
            <div style={{ width: ib, height: ib, borderRadius: 16, background: brand.panel, border: `1px solid ${brand.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={s.icon || fallback[i % fallback.length]} color={brand.primary} size={ic} />
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: lf, color: brand.primary, lineHeight: 1.15 }}>{stripEmoji(s.label || s.title)}</div>
            {s.sub && <div style={{ fontFamily: SANS, fontWeight: 400, fontSize: sf, color: brand.slate, lineHeight: 1.3 }}>{stripEmoji(s.sub)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── ArrowMark: a directional arrow that draws on ──
function ArrowMark({ c, fps, brand, durMs }) {
  const frame = useCurrentFrame();
  const settle = ms2f(c.enter_at_ms || 150, fps);
  const t = interpolate(frame, [settle, settle + ms2f(360, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const down = String(c.dir || '').toLowerCase() === 'down';
  const col = down ? brand.bear : brand.bull;
  return (
    <div style={{ width: '100%', maxWidth: 900, alignSelf: 'center', opacity: t, display: 'flex', alignItems: 'center', gap: 26 }}>
      <Icon name={down ? 'trend_down' : 'trend_up'} color={col} size={56} />
      {c.label && <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 36, color: col, letterSpacing: '-0.01em' }}>{c.label}</div>}
    </div>
  );
}

// ── Crowd: retail figures that bob, then get FLUSHED OUT + turn bearish (the trap) ──
function Crowd({ c, fps, brand }) {
  const frame = useCurrentFrame();
  const base = ms2f(c.enter_at_ms || 150, fps);
  const n = Math.min(6, c.count || 4);
  const appear = interpolate(frame, [base, base + ms2f(320, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flushAt = base + ms2f(c.flush_at_ms != null ? c.flush_at_ms : 1500, fps);
  const flush = interpolate(frame, [flushAt, flushAt + ms2f(750, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  return (
    <div style={{ width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
      {(c.label || flush > 0) && <div style={{ fontFamily: MONOS, fontWeight: 600, fontSize: 34, letterSpacing: '0.08em', textTransform: 'uppercase', color: flush > 0.4 ? brand.bear : brand.slate }}>{flush > 0.4 ? (c.flush_label || 'FLUSHED OUT') : (c.label || 'RETAIL PILES IN')}</div>}
      <div style={{ display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'flex-end', height: 130, marginTop: 14 }}>
        {Array.from({ length: n }).map((_, i) => {
          const bob = Math.sin((frame / fps) * 3 + i * 0.6) * 7 * (1 - flush);
          const col = flush > 0.5 ? brand.bear : brand.bull;
          const tx = flush * (70 + i * 12), ty = flush * 100 - bob, rot = flush * 24;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: appear * (1 - flush), transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)` }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: col }} />
              <div style={{ width: 34, height: 42, borderRadius: '14px 14px 6px 6px', background: col, opacity: 0.9, marginTop: 5 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── FairValueGap: an impulse with an unfilled gap highlighted between candles ──
function FairValueGap({ c, fps, brand }) {
  const frame = useCurrentFrame();
  const base = ms2f(c.enter_at_ms || 150, fps);
  const W = 600, H = 300;
  // candle1 (small), candle2 (big impulse), candle3 (small) — gap = c1.high..c3.low
  const cands = [{ x: 150, top: 180, bot: 230, hi: 165, lo: 245 }, { x: 300, top: 95, bot: 200, hi: 80, lo: 210 }, { x: 450, top: 70, bot: 120, hi: 58, lo: 135 }];
  const gTop = 135, gBot = 165; // the imbalance band
  const draw = interpolate(frame, [base, base + ms2f(380, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const boxW = interpolate(frame, [base + ms2f(420, fps), base + ms2f(760, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
      {c.label && <div style={{ fontFamily: MONOS, fontWeight: 600, fontSize: 34, letterSpacing: '0.08em', textTransform: 'uppercase', color: brand.slate, marginBottom: 10 }}>{c.label}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {cands.map((cd, i) => {
          const t = interpolate(frame, [base + ms2f(i * 90, fps), base + ms2f(i * 90 + 240, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const bh = (cd.bot - cd.top) * t, mid = (cd.top + cd.bot) / 2;
          return (
            <g key={i} opacity={t}>
              <line x1={cd.x} y1={cd.hi} x2={cd.x} y2={cd.lo} stroke={brand.bull} strokeWidth="2.4" strokeLinecap="round" opacity={0.85} />
              <rect x={cd.x - 17} y={mid - bh / 2} width="34" height={bh} rx="2.5" fill={brand.bull} />
            </g>
          );
        })}
        <rect x={110} y={gTop} width={Math.max(1, 380 * boxW)} height={gBot - gTop} fill="rgba(110,134,201,0.20)" stroke={brand.periwinkle} strokeWidth="2" strokeDasharray="6 5" />
        <g opacity={boxW}>
          <rect x={110} y={gTop - 30} width="64" height="26" rx="6" fill={brand.periwinkle} />
          <text x={122} y={gTop - 12} fontFamily={MONO} fontSize="16" fontWeight="700" fill="#fff">{c.tag || 'FVG'}</text>
        </g>
      </svg>
    </div>
  );
}

// ── StructureBreak: zigzag price that breaks a prior swing — BOS vs CHoCH ──
function StructureBreak({ c, fps, brand }) {
  const frame = useCurrentFrame();
  const base = ms2f(c.enter_at_ms || 150, fps);
  const W = 600, H = 300;
  const choch = String(c.kind || c.label || '').toLowerCase().includes('choch');
  const path = choch ? 'M30 110 L110 70 L190 130 L270 60 L350 150 L470 230' : 'M30 220 L110 160 L190 200 L270 110 L350 150 L470 60';
  const lvl = choch ? 60 : 110; // the swing being broken
  const draw = interpolate(frame, [base, base + ms2f(620, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const lineT = interpolate(frame, [base + ms2f(300, fps), base + ms2f(640, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tagT = interpolate(frame, [base + ms2f(700, fps), base + ms2f(960, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)) });
  const col = choch ? brand.accent : brand.bull;
  return (
    <div style={{ width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <line x1={30} y1={lvl} x2={30 + 440 * lineT} y2={lvl} stroke={brand.slate} strokeWidth="2" strokeDasharray="7 6" />
        <path d={path} fill="none" stroke={brand.primary} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw} />
        <g opacity={tagT} transform={`translate(360, ${lvl - 38}) scale(${0.8 + 0.2 * tagT})`}>
          <rect x="0" y="0" width={choch ? 96 : 70} height="32" rx="8" fill={col} />
          <text x="12" y="22" fontFamily={MONO} fontSize="18" fontWeight="700" fill="#fff">{choch ? 'CHoCH' : 'BOS'}</text>
        </g>
      </svg>
    </div>
  );
}

// ── TradePlan: entry / stop / target with risk:reward zones ──
function TradePlan({ c, fps, brand }) {
  const frame = useCurrentFrame();
  const base = ms2f(c.enter_at_ms || 150, fps);
  const W = 600, H = 300;
  const short = String(c.dir || '').toLowerCase() === 'short' || String(c.dir || '').toLowerCase() === 'down';
  const entry = 160, sl = short ? 100 : 220, tp = short ? 280 : 40;
  const t = interpolate(frame, [base, base + ms2f(420, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const grow = interpolate(frame, [base + ms2f(420, fps), base + ms2f(820, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const row = (y, color, label) => (
    <g opacity={t}>
      <line x1={60} y1={y} x2={60 + 420 * t} y2={y} stroke={color} strokeWidth="3" />
      <rect x={W - 130} y={y - 16} width="100" height="28" rx="6" fill={color} />
      <text x={W - 118} y={y + 4} fontFamily={MONO} fontSize="16" fontWeight="700" fill="#fff">{label}</text>
    </g>
  );
  return (
    <div style={{ width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* risk zone (entry→SL) and reward zone (entry→TP) */}
        <rect x={60} y={Math.min(entry, sl)} width={420 * grow} height={Math.abs(entry - sl)} fill="rgba(210,56,79,0.14)" />
        <rect x={60} y={Math.min(entry, tp)} width={420 * grow} height={Math.abs(entry - tp)} fill="rgba(31,157,107,0.14)" />
        {row(sl, brand.bear, 'STOP')}
        {row(entry, brand.primary, 'ENTRY')}
        {row(tp, brand.bull, 'TARGET')}
        <g opacity={grow}>
          <rect x={60} y={tp + (short ? 16 : -44)} width="120" height="30" rx="8" fill={brand.accent} />
          <text x={72} y={tp + (short ? 36 : -24)} fontFamily={MONO} fontSize="17" fontWeight="700" fill="#fff">{c.rr || 'R:R 1:3'}</text>
        </g>
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ChartConcept — ONE coherent, data-driven candlestick chart with the SMC feature
// marked ON it (D3 scales for math, React SVG, all animation via useCurrentFrame).
// Replaces the 6 separate chart primitives. Deterministic synthetic data.
// ════════════════════════════════════════════════════════════════════════════
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const PATTERNS = {
  bearish_smc: [0.40, 0.46, 0.42, 0.52, 0.58, 0.54, 0.64, 0.72, 0.78, 0.70, 0.58, 0.50, 0.55, 0.44, 0.34, 0.26],
  bullish_smc: [0.60, 0.54, 0.58, 0.48, 0.42, 0.46, 0.36, 0.28, 0.22, 0.30, 0.42, 0.50, 0.45, 0.56, 0.66, 0.74],
  range:       [0.46, 0.54, 0.45, 0.55, 0.47, 0.56, 0.44, 0.55, 0.46, 0.54, 0.45, 0.55, 0.47, 0.53, 0.46, 0.54],
};
function buildSeries(pattern, seed) {
  const rnd = mulberry32((seed | 0) + 1);
  const base = PATTERNS[pattern] || PATTERNS.bearish_smc;
  const closes = base.map(v => Math.max(0.07, Math.min(0.93, v + (rnd() - 0.5) * 0.03)));
  const cands = closes.map((c, i) => {
    const o = i === 0 ? Math.max(0.07, c - 0.04) : closes[i - 1];
    const up = c >= o, wick = 0.012 + rnd() * 0.028;
    return { o, c, up, hi: Math.min(0.99, Math.max(o, c) + wick), lo: Math.max(0.01, Math.min(o, c) - wick) };
  });
  const bearish = pattern !== 'bullish_smc';
  let impI = 1, impMax = 0; for (let i = 1; i < cands.length; i++) { const d = Math.abs(cands[i].c - cands[i].o); if (d > impMax) { impMax = d; impI = i; } }
  return { cands, closes, impI, bearish };
}
function featOf(c) {
  if (c.feature) return c.feature;
  switch (c.type) {
    case 'structure_break': return String(c.kind || 'bos').toLowerCase().includes('choch') ? 'choch' : 'bos';
    case 'zone_box': return 'order_block';
    case 'liquidity_run': return 'liquidity_sweep';
    case 'fvg': return 'fvg';
    case 'trade_plan': return 'trade_plan';
    default: return 'candles';
  }
}
// SVG label tag sized to its text (never clips), centred on (cx, anchored top at ty)
function SvgTag({ cx, ty, text, fill, fs = 19 }) {
  const w = 16 + String(text).length * fs * 0.58, h = fs + 14;
  return (
    <g>
      <rect x={cx - w / 2} y={ty} width={w} height={h} rx="6" fill={fill} />
      <text x={cx} y={ty + h / 2} fontFamily={MONO} fontSize={fs} fontWeight="700" fill="#fff" textAnchor="middle" dominantBaseline="central">{text}</text>
    </g>
  );
}
function ChartConcept({ c, seg, fps, brand, idx }) {
  const frame = useCurrentFrame();
  const pattern = c.pattern || (String(c.bias || seg.chart_bias || '').toLowerCase().includes('bull') ? 'bullish_smc' : 'bearish_smc');
  const feature = featOf(c);
  const seed = (seg.segment_id || 0) * 7 + (idx || 0);
  const { cands, closes, impI, bearish } = buildSeries(pattern, seed);
  const W = 900, H = 470, padX = 44, padTop = 54, padBot = 44, n = cands.length;
  const x = scaleLinear().domain([0, n - 1]).range([padX, W - padX]);
  const y = scaleLinear().domain([0, 1]).range([H - padBot, padTop]);
  const slot = (W - 2 * padX) / (n - 1), bw = Math.min(26, slot * 0.6);
  const base = ms2f(c.enter_at_ms || 150, fps);
  const featStart = base + ms2f(70 * n + 140, fps);
  const draw = interpolate(frame, [featStart, featStart + ms2f(420, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const tagT = interpolate(frame, [featStart + ms2f(380, fps), featStart + ms2f(700, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.34, 1.56, 0.64, 1) });

  // landmarks
  const half = Math.floor(n * 0.6);
  const lvlP = bearish ? Math.min(...closes.slice(0, half)) : Math.max(...closes.slice(0, half));
  let breakIdx = -1; for (let i = half; i < n; i++) { if (bearish ? closes[i] < lvlP : closes[i] > lvlP) { breakIdx = i; break; } }
  if (breakIdx < 0) breakIdx = Math.min(n - 1, impI + 1);
  const swingExtP = bearish ? Math.max(...closes) : Math.min(...closes);
  const swingExtI = bearish ? closes.indexOf(Math.max(...closes)) : closes.indexOf(Math.min(...closes));

  const overlay = () => {
    if (feature === 'bos' || feature === 'choch') {
      const yl = y(lvlP), xb = x(breakIdx);
      return (<g>
        <line x1={padX} y1={yl} x2={padX + (W - 2 * padX) * draw} y2={yl} stroke={brand.slate} strokeWidth="2.5" strokeDasharray="8 6" />
        <line x1={xb} y1={yl} x2={xb} y2={y(closes[breakIdx])} stroke={feature === 'choch' ? brand.accent : brand.bull} strokeWidth="4" strokeLinecap="round" opacity={draw} />
        {tagT > 0 && <g transform={`scale(${0.85 + 0.15 * tagT})`} style={{ transformOrigin: `${xb}px ${yl}px`, transformBox: 'fill-box' }}><SvgTag cx={xb} ty={yl - 38} text={feature === 'choch' ? 'CHoCH' : 'BOS'} fill={feature === 'choch' ? brand.accent : brand.bull} /></g>}
      </g>);
    }
    if (feature === 'order_block') {
      const i = Math.max(1, impI - 1), cd = cands[i];
      const yt = y(Math.max(cd.o, cd.c)), yb = y(Math.min(cd.o, cd.c));
      return (<g>
        <rect x={x(i) - slot * 0.7} y={yt} width={Math.max(1, (W - padX - (x(i) - slot * 0.7)) * draw)} height={(yb - yt)} fill="rgba(192,83,31,0.14)" stroke={brand.accent} strokeWidth="2.4" />
        {tagT > 0 && <SvgTag cx={x(i)} ty={yt - 38} text={c.label && c.label.length < 16 ? c.label.toUpperCase() : 'ORDER BLOCK'} fill={brand.accent} />}
      </g>);
    }
    if (feature === 'fvg') {
      const i = impI, top = y(cands[i - 1] ? cands[i - 1].hi : cands[i].hi), bot = y(cands[i + 1] ? cands[i + 1].lo : cands[i].lo);
      return (<g>
        <rect x={x(i) - slot * 0.6} y={Math.min(top, bot)} width={Math.max(1, slot * 1.6 * draw)} height={Math.abs(bot - top)} fill="rgba(110,134,201,0.20)" stroke={brand.periwinkle} strokeWidth="2.2" strokeDasharray="6 5" />
        {tagT > 0 && <SvgTag cx={x(i)} ty={Math.min(top, bot) - 36} text="FVG" fill={brand.periwinkle} />}
      </g>);
    }
    if (feature === 'liquidity_sweep') {
      const yl = y(swingExtP), xs = x(swingExtI);
      return (<g>
        <line x1={padX} y1={yl} x2={padX + (W - 2 * padX) * draw} y2={yl} stroke={brand.periwinkle} strokeWidth="2.5" strokeDasharray="8 6" />
        <line x1={xs} y1={yl} x2={xs} y2={yl - 34 * tagT} stroke={brand.bear} strokeWidth="5" strokeLinecap="round" />
        {tagT > 0 && <SvgTag cx={xs} ty={yl - 78} text="LIQUIDITY SWEPT" fill={brand.bear} />}
      </g>);
    }
    if (feature === 'trade_plan') {
      const entryP = closes[Math.min(n - 1, impI + 2)];
      const slP = bearish ? Math.min(0.97, swingExtP + 0.05) : Math.max(0.03, swingExtP - 0.05);
      const tpP = bearish ? Math.min(...closes) : Math.max(...closes);
      const row = (p, col, lab) => (<g opacity={draw}><line x1={padX} y1={y(p)} x2={W - padX} y2={y(p)} stroke={col} strokeWidth="3" /><SvgTag cx={W - padX - 56} ty={y(p) - 13} text={lab} fill={col} fs={16} /></g>);
      return (<g>
        <rect x={padX} y={Math.min(y(entryP), y(slP))} width={(W - 2 * padX)} height={Math.abs(y(entryP) - y(slP)) * draw} fill="rgba(210,56,79,0.12)" />
        <rect x={padX} y={Math.min(y(entryP), y(tpP))} width={(W - 2 * padX)} height={Math.abs(y(entryP) - y(tpP)) * draw} fill="rgba(31,157,107,0.12)" />
        {row(slP, brand.bear, 'STOP')}{row(entryP, brand.primary, 'ENTRY')}{row(tpP, brand.bull, 'TARGET')}
        {tagT > 0 && <SvgTag cx={padX + 80} ty={y(tpP) + (bearish ? 14 : -42)} text={c.rr ? `R:R 1:${c.rr}` : 'R:R 1:3'} fill={brand.accent} />}
      </g>);
    }
    return null;
  };

  return (
    <div style={{ width: '100%', maxWidth: 1280, alignSelf: 'center' }}>
      {c.label && <div style={{ fontFamily: MONOS, fontWeight: 600, fontSize: 30, letterSpacing: '0.06em', textTransform: 'uppercase', color: brand.slate, marginBottom: 12 }}>{c.label}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {cands.map((cd, i) => {
          const settle = base + ms2f(i * 70, fps);
          const t = interpolate(frame, [settle, settle + ms2f(220, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) });
          if (t <= 0) return null;
          const cx = x(i), col = cd.up ? brand.bull : brand.bear;
          const yO = y(cd.o), yC = y(cd.c), top = Math.min(yO, yC), bot = Math.max(yO, yC);
          const mid = (top + bot) / 2, bh = Math.max(3, (bot - top)) * t;
          return (<g key={i} opacity={t}>
            <line x1={cx} y1={y(cd.hi)} x2={cx} y2={y(cd.lo)} stroke={col} strokeWidth="2.2" strokeLinecap="round" opacity={0.85} />
            <rect x={cx - bw / 2} y={mid - bh / 2} width={bw} height={bh} rx="2" fill={col} />
          </g>);
        })}
        {overlay()}
      </svg>
    </div>
  );
}

function Annotation({ c, seg, fps, brand, mode, chartAnchor, chartBox }) {
  const frame = useCurrentFrame();
  const settle = ms2f(c.enter_at_ms || 200, fps);
  const s = interpolate(frame, [Math.max(0, settle - ms2f(260, fps)), settle], [0.75, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)) });
  const o = interpolate(frame, [Math.max(0, settle - ms2f(260, fps)), settle], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  let boxL = 0, boxT = 0, boxW = CANVAS_W, boxH = CANVAS_H;
  if (mode !== 'graphics' && chartBox) { boxL = chartBox.left; boxT = chartBox.top; boxW = chartBox.width; boxH = chartBox.height; }
  else if (mode === 'chart_inset') { const sc = INSET_SCALE_DEFAULT; const c2 = resolveCentre({ anchor: chartAnchor }, sc); boxW = sc*CANVAS_W; boxH = sc*CANVAS_H; boxL = c2.cx - boxW/2; boxT = c2.cy - boxH/2; }
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

// CTA/outro scene — on the SHARED white grid (no navy takeover), dynamic + keep-alive.
function OutroCTA({ c, seg, fps, brand }) {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const baseMs = c.enter_at_ms || 120;
  const btn = entrance('pop', frame, ms2f(baseMs + 900, fps), fps, 460);
  const link = entrance('rise', frame, ms2f(baseMs + 1400, fps), fps, 360);
  const pulse = 1 + 0.02 * Math.sin((frame / fps) * 1.3 * Math.PI * 2); // keep-alive breathing
  const fs = fitSize(c.headline, 1520, 900, 104, 132);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeIn }}>
      <div style={{ position: 'absolute', top: '-10%', right: '-8%', width: 1100, height: 1100, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,83,31,0.10) 0%, rgba(192,83,31,0) 60%)' }} />
      <div style={{ textAlign: 'center', padding: '0 180px', maxWidth: 1560 }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: fs, color: brand.primary, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          <KineticText text={c.headline} settleMs={baseMs} fps={fps} kind="rise" perWordMs={80} durMs={460} />
        </div>
        {c.button && <div style={{ ...btn, display: 'inline-block', marginTop: 44, background: brand.accent, color: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 42, padding: '22px 52px', borderRadius: 16, transform: `${btn.transform || ''} scale(${pulse})`, boxShadow: '0 14px 40px rgba(192,83,31,0.30)' }}>{c.button}</div>}
        {c.link && <div style={{ ...link, fontFamily: SANS, fontSize: 32, color: brand.slate, marginTop: 24 }}>{c.link}</div>}
      </div>
      <BrandBug brand={brand} />
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
  } else if (mode === 'chart_full') {
    // #5: play full, then at clip end zoom OUT to the inset (no long full-screen freeze).
    const cf = ms2f(((chart.play_to||0) - (chart.play_from||0)) * 1000, fps);
    const zt = interpolate(frame, [cf, cf + ms2f(700, fps)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
    const sTo = INSET_SCALE_DEFAULT, toC = resolveCentre({ anchor: 'center_right' }, sTo);
    scale = 1 + (sTo - 1) * zt;
    cx = CANVAS_W/2 + (toC.cx - CANVAS_W/2) * zt;
    cy = CANVAS_H/2 + (toC.cy - CANVAS_H/2) * zt;
  }
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
            <AbsoluteFill>
              {/* C5: hold the last frame so the chart never goes blank when the clip ends before the segment */}
              <Freeze frame={ms2f((chart.play_to||0)*1000, fps)}>
                <Video src={srcUrl} muted objectFit="contain" style={fillVid} />
              </Freeze>
              <Sequence from={0} durationInFrames={Math.max(1, ms2f(((chart.play_to||0)-(chart.play_from||0))*1000, fps))}>
                <Video src={srcUrl} trimBefore={ms2f((chart.play_from||0)*1000, fps)} trimAfter={ms2f((chart.play_to||0)*1000, fps)} muted objectFit="contain" style={fillVid} />
              </Sequence>
            </AbsoluteFill>
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