// ── video/VideoComposerV2.jsx ─────────────────────────────────────────────
// v2 AGENT-PLATFORM composition (RedPill v2 "Yellow-Dude" editing grammar).
// Same dumb-executor contract as VideoComposer (v3): every coordinate, frame
// range and animation param comes from CE_Agent_Render's payload — this file
// only draws + interpolates (useCurrentFrame everywhere, no CSS animations).
// Differences from VideoComposer:
//   • DYNAMIC dimensions — reads width/height from useVideoConfig() (1920×1080
//     longform / 1080×1920 shortform), never hardcodes the canvas.
//   • EmphasisV2 typography styles: plain | quote (myth marker) | strike_correct
//     (red strike draws through, correction stamps in) | underline (red draw-on),
//     plus the small italic `annotation` side-note.
//   • draw_on entrances (draw_arrow/draw_region/draw_strike/draw_underline):
//     frame-driven stroke-dashoffset SVG draw-on over the element's box.
//   • zoom_circle treatment: circular callout + leader line toward the character.
//   • effects[]: shake (camera noise), glitch (slice bars), speed_lines,
//     fire_aura (glow behind the character), punch_in (camera step) — all
//     frame-windowed, all deterministic.
//   • no icon/glyph asset tier — every non-character element is a generated
//     visual; a failed/empty generation draws a neutral placeholder instead.
// The legacy VideoComposer/VideoComposer payloads are untouched — this is a
// separate composition, routed by payload.composition === 'VideoComposerV2'.
import React, { useState, useEffect } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Img, Audio, Sequence, staticFile, interpolate, spring, delayRender, continueRender } from 'remotion';
import { measureText } from '@remotion/layout-utils';
import { resolveEntrance, resolveIdle, resolveCamera, easingFn } from './motion';
import { loadFont } from '@remotion/google-fonts/Montserrat';

const { fontFamily: MONTSERRAT, waitUntilDone: montserratReady } = loadFont('normal', { weights: ['600', '700', '800'], subsets: ['latin'] });
const fontStack = () => `${MONTSERRAT}, 'Helvetica Neue', Arial, sans-serif`;

// ── failed/empty asset placeholder: a subtle neutral box, never a hard blank ─
function AssetPlaceholder({ size, theme }) {
  const s = size || 96;
  return <div style={{ width: s, height: s, borderRadius: Math.round(s * 0.12), background: (theme && theme.primary) || '#1A1A1A', opacity: 0.18 }} />;
}

function BaseLayerV({ layer, theme }) {
  const bg = layer.background || { type: 'flat' };
  if (bg.type === 'cinematic' && !bg.color) {
    return <AbsoluteFill style={{ background: `linear-gradient(180deg, ${theme.primary || '#1A1A1A'} 0%, ${theme.accent || '#9B1B1B'} 150%)` }} />;
  }
  return <AbsoluteFill style={{ backgroundColor: bg.color || theme.bg_color || '#FFFFFF' }} />;
}

// alpha-trim (identical approach to v1: bottom-anchor on VISIBLE pixels; graceful)
const _trimCache = {};
function useAlphaTrim(src) {
  const [trim, setTrim] = useState(src && _trimCache[src] !== undefined ? _trimCache[src] : null);
  const [handle] = useState(() => (src && _trimCache[src] === undefined && typeof window !== 'undefined' ? delayRender(`trimv2:${src}`) : null));
  useEffect(() => {
    if (!src) return;
    if (_trimCache[src] !== undefined) { setTrim(_trimCache[src]); if (handle != null) continueRender(handle); return; }
    const done = (t) => { _trimCache[src] = t; setTrim(t); if (handle != null) continueRender(handle); };
    try {
      const img = new window.Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          let minY = c.height, maxY = -1;
          for (let y = 0; y < c.height; y++) {
            for (let x = 0; x < c.width; x++) { if (data[(y * c.width + x) * 4 + 3] > 12) { if (y < minY) minY = y; if (y > maxY) maxY = y; break; } }
          }
          done(maxY >= minY ? { top: minY / c.height, bottom: 1 - (maxY + 1) / c.height } : null);
        } catch (e) { done(null); }
      };
      img.onerror = () => done(null);
      img.src = src;
    } catch (e) { done(null); }
  }, [src]);
  return trim;
}

// ── v2: draw-on annotation overlay (arrow/region/strike/underline) ──────────
// Frame-driven stroke-dashoffset "live authorship" reveal over the element box.
function DrawOn({ shape, progress, w, h, color }) {
  const c = color || '#9B1B1B';
  const sw = Math.max(4, Math.round(Math.min(w, h) * 0.03));
  let el = null, len = 0;
  if (shape === 'region') {
    len = 2 * (w + h);
    el = <rect x={sw} y={sw} width={Math.max(1, w - 2 * sw)} height={Math.max(1, h - 2 * sw)} rx={Math.min(18, h * 0.08)}
      fill="none" stroke={c} strokeWidth={sw} strokeDasharray={`14 10`}
      strokeDashoffset={0} pathLength={len}
      style={{ strokeDasharray: `${len * progress} ${len}`, opacity: 0.95 }} />;
  } else if (shape === 'arrow') {
    len = Math.hypot(w * 0.7, h * 0.5);
    const x1 = w * 0.05, y1 = h * 0.15, x2 = w * 0.7, y2 = h * 0.6;
    el = <g fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={`M ${x1} ${y1} Q ${w * 0.3} ${h * 0.1} ${x2} ${y2}`} pathLength={100}
        style={{ strokeDasharray: `${100 * progress} 100` }} />
      {progress > 0.85 ? <polyline points={`${x2 - w * 0.09},${y2 - h * 0.02} ${x2},${y2} ${x2 - w * 0.02},${y2 - h * 0.10}`}
        style={{ opacity: (progress - 0.85) / 0.15 }} /> : null}
    </g>;
  } else if (shape === 'strike') {
    el = <line x1={w * 0.04} y1={h * 0.52} x2={w * 0.04 + (w * 0.92) * progress} y2={h * 0.48}
      stroke={c} strokeWidth={Math.max(sw, h * 0.06)} strokeLinecap="round" />;
  } else {   // underline
    el = <line x1={w * 0.06} y1={h * 0.94} x2={w * 0.06 + (w * 0.88) * progress} y2={h * 0.94}
      stroke={c} strokeWidth={Math.max(sw, h * 0.05)} strokeLinecap="round" />;
  }
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>{el}</svg>;
}

// CONTAINMENT INVARIANT: visuals self-contain via object-fit:contain in a frame-clamped
// box; circles crop to min(boxW,boxH); the character is width-clamped + bottom-anchored
// (its box is nominal — do NOT hard-clip it); the zoom_circle leader line overflows on
// purpose. Text containment lives in EmphasisV2 (fitStackedLines + region clip).
function ImageLayerV2({ layer, frame, fps, assets, theme, W, H }) {
  const a = assets[layer.asset_ref];
  const lo = layer.layout || { x: W / 2, y: H / 2, scale: 0.4 };
  const local = frame - layer.frameStart;
  const isDrawOn = layer.entrance && layer.entrance.kind === 'draw_on';
  // draw_on: the annotation draws; the underlying image ramps in during the draw.
  const ent = isDrawOn ? { scale: 1, x: 0, y: 0, rotation: 0, clip: null,
    opacity: interpolate(local, [0, Math.max(2, (layer.entrance.durationFrames || 14) * 0.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }
    : resolveEntrance(layer.entrance, local, fps);
  const drawP = isDrawOn ? interpolate(local, [0, Math.max(1, layer.entrance.durationFrames || 14)], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingFn('easeOutCubic') }) : 0;
  const idle = resolveIdle(layer.idle, frame);
  const isChar = layer.kind === 'character';

  const trim = useAlphaTrim((isChar && a && (a.localUrl || a.url)) ? (a.localUrl || a.url) : null);
  const contentV = trim ? Math.max(0.2, 1 - (trim.top || 0) - (trim.bottom || 0)) : 1;
  const height = isChar ? ((lo.heightPctTarget || 0.70) * H) / contentV : undefined;
  const trimShiftY = (isChar && trim && height) ? (trim.bottom || 0) * height : 0;

  const x = lo.x + ent.x + idle.x;
  const y = lo.y + ent.y + idle.y + trimShiftY;
  const scale = ent.scale * (1 + idle.scale);
  const rot = ent.rotation + idle.rotation;
  const anchorY = (isChar && lo.bottomAnchored) ? '-100%' : '-50%';
  const glow = idle.glow ? `drop-shadow(0 0 ${14 * idle.glow}px ${theme.accent || '#9B1B1B'})` : 'none';
  const boxW = (!isChar && lo.boxW) ? lo.boxW : ((lo.scale || 0.4) * W);
  const boxH = (!isChar && lo.boxH) ? lo.boxH : undefined;
  const layerOpacity = (lo.opacity != null ? lo.opacity : 1);
  const isZoomCircle = layer.treatment === 'zoom_circle';

  let content = null;
  if (a && (a.localUrl || a.url)) {
    if (isChar) {
      const charMaxW = Math.min(W * 0.96, (lo.scale ? lo.scale * W * 1.6 : W * 0.96));
      const imgStyle = { height, width: 'auto', maxWidth: charMaxW, objectFit: 'contain', display: 'block' };
      if (ent.clip) { imgStyle.clipPath = ent.clip; imgStyle.WebkitClipPath = ent.clip; }
      content = <Img src={a.localUrl || a.url} style={imgStyle} />;
    } else if (lo.circle) {
      const d = Math.min(boxW, boxH || boxW);
      const border = `${Math.max(3, Math.round(d * 0.045))}px solid ${isZoomCircle ? (theme.accent || '#9B1B1B') : (theme.primary || '#1A1A1A')}`;
      content = (
        <div style={{ position: 'relative', width: d, height: d }}>
          {isZoomCircle ? (
            // leader line from the callout circle toward the character (frame-driven draw)
            <svg width={d * 0.6} height={d * 0.3} viewBox={`0 0 ${d * 0.6} ${d * 0.3}`}
              style={{ position: 'absolute', left: -d * 0.55, top: d * 0.42, overflow: 'visible' }}>
              <line x1={d * 0.6} y1={d * 0.05} x2={d * 0.6 - (d * 0.55) * Math.min(1, Math.max(0, local / 10))} y2={d * 0.25}
                stroke={theme.accent || '#9B1B1B'} strokeWidth={Math.max(3, d * 0.02)} strokeLinecap="round" />
              <circle cx={d * 0.6 - (d * 0.55) * Math.min(1, Math.max(0, local / 10))} cy={d * 0.25} r={Math.max(4, d * 0.03)} fill={theme.accent || '#9B1B1B'} style={{ opacity: local > 8 ? 1 : 0 }} />
            </svg>
          ) : null}
          <div style={{ width: d, height: d, borderRadius: '50%', overflow: 'hidden', border, background: '#fff' }}>
            <Img src={a.localUrl || a.url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        </div>
      );
    } else {
      const vW = Math.min(boxW || (W * 0.5), W);
      const vH = Math.min(boxH || vW, H);
      const imgStyle = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' };
      if (ent.clip) { imgStyle.clipPath = ent.clip; imgStyle.WebkitClipPath = ent.clip; }
      content = (
        <div style={{ position: 'relative', width: vW, height: vH }}>
          <Img src={a.localUrl || a.url} style={imgStyle} />
          {isDrawOn ? <DrawOn shape={layer.entrance.shape || 'region'} progress={drawP} w={vW} h={vH} color={theme.accent} /> : null}
        </div>
      );
    }
  }
  if (!content && layer.asset_ref) {
    content = <AssetPlaceholder size={(boxW || height || 140)} theme={theme} />;
  }
  if (!content) return null;

  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, ${anchorY}) scale(${scale}) rotate(${rot}deg)`, opacity: ent.opacity * layerOpacity, filter: glow }}>
      {content}
    </div>
  );
}

// ── v2 typography: plain | quote | strike_correct | underline (+ annotation) ─
function EmphasisV2({ layer, frame, fps, theme, W, H }) {
  const local = frame - layer.frameStart;
  const ent = layer.entrance || {};
  const stag = Math.max(1, Math.round(((ent.wordStaggerMs || 90) / 1000) * fps));
  const color = layer.color || theme.title_color || '#1A1A1A';
  const kwColor = layer.keyword_color || theme.accent || '#9B1B1B';
  const style2 = layer.style || 'plain';
  const kw = (layer.keyword || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const isKwWord = (w) => kw && w.toUpperCase().replace(/[^A-Z0-9]/g, '') === kw;
  const STROKE = { WebkitTextStroke: '3px #FFFFFF', paintOrder: 'stroke' };
  const FONT_FAMILY = MONTSERRAT;

  const containerW = ((layer.titleW != null ? layer.titleW : 0.88) * W) - 28;
  const regionH = (layer.titleH != null ? layer.titleH : 0.12) * H;

  const REF = 100;
  const measureW = (text) => {
    // validateFontIsLoaded is CRITICAL: layout-utils keeps a module-level word cache
    // with no font awareness — a measurement taken before Montserrat's @font-face is
    // applied would cache FALLBACK-font widths (far narrower than Montserrat 800) and
    // poison every later frame's fit (the session-16 "titles clip at both band edges"
    // bug). With validation on, a pre-load call throws instead of caching; the catch
    // estimate is used for that (never-captured) pass only.
    try { return measureText({ text, fontFamily: FONT_FAMILY, fontSize: REF, fontWeight: 800, letterSpacing: '-0.5px', validateFontIsLoaded: true }).width; }
    catch (e) { return String(text).length * REF * 0.80; }
  };
  const LINE_H = 1.2;    // fit-math line height (render uses 1.08–1.1; the slack is stroke headroom)
  const LIST_GAP = 6;    // must match the title-list marginBottom below
  const PAD_V = 4;       // stroke-safe vertical padding on the clipped region container
  const fitStackedLines = (texts, extraFrac) => {
    // ONE uniform font size such that ALL stacked entries — each word-wrapping into
    // its own rows — fit the region height TOGETHER, and no single word exceeds the
    // region width. N=1 is the plain title; N>1 is the title-list. (The old per-line
    // fitFont sized every list entry to the FULL region height → N× overflow.)
    const wWs = texts.map(t => String(t || '').split(/\s+/).filter(Boolean).map(w => measureW(w)));
    if (!wWs.some(ws => ws.length)) return 24;
    const availH = Math.max(1, (regionH - 2 * PAD_V) * (1 - (extraFrac || 0)) - (texts.length - 1) * LIST_GAP);
    const longestW = wWs.reduce((m, ws) => ws.reduce((m2, x) => Math.max(m2, x), m), 1);
    const spaceW = Math.max(1, measureW('x x') - measureW('xx'));
    const countRows = (ws, scale) => {
      if (!ws.length) return 0;
      let rows = 1, cur = 0;
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i] * scale;
        if (i === 0) cur = w;
        else if (cur + spaceW * scale + 4 + w <= containerW) cur += spaceW * scale + 4 + w; // +4 = the render's fixed wordSpacing:'4px'
        else { rows++; cur = w; }
      }
      return rows;
    };
    let fs = Math.min(240, Math.floor(availH / Math.max(1, texts.length)));
    for (let k = 0; k < 400 && fs > 10; k++) {
      const scale = fs / REF;
      const totalRows = wWs.reduce((s, ws) => s + countRows(ws, scale), 0);
      if (longestW * scale <= containerW && totalRows * fs * LINE_H <= availH * 0.96) break;
      fs -= 2;
    }
    return Math.max(10, fs);
  };
  // extraFrac reserves height for correction/annotation/underline rows (strike_correct etc.)
  const fitFont = (str, extraFrac) => fitStackedLines([str], extraFrac);

  const posStyle = {
    position: 'absolute',
    top: (layer.titleY != null ? (layer.titleY * 100) + '%' : '7%'),
    left: (layer.titleX != null ? (layer.titleX * 100) + '%' : 0),
    width: (layer.titleW != null ? (layer.titleW * 100) + '%' : '100%'),
    height: (layer.titleH != null ? (layer.titleH * 100) + '%' : 'auto'),
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    // hard-clip at the region boundary — "every component fits its box" safety net for
    // ALL text; the fit math above keeps real content inside, the small vertical padding
    // keeps the 3px white letter-stroke out of the clip edge.
    textAlign: 'center', padding: PAD_V + 'px 14px', boxSizing: 'border-box', overflow: 'hidden',
  };
  const textBox = { width: '100%', whiteSpace: 'normal', overflowWrap: 'normal', wordBreak: 'normal', wordSpacing: '4px' };

  const renderWords = (wordList, animated) => wordList.flatMap((w, i) => {
    const st = { color: isKwWord(w) ? kwColor : color };
    let style = st;
    if (animated) {
      const wf = local - i * stag;
      const op = interpolate(wf, [0, 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const ty = interpolate(wf, [0, 7], [14, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      style = { ...st, display: 'inline-block', opacity: op, transform: `translateY(${ty}px)` };
    }
    const span = <span key={i} style={style}>{w}</span>;
    return i === 0 ? [span] : [' ', span];
  });

  // TITLE-LIST — stacked lines, ONE uniform size for the whole list (fitStackedLines
  // sizes all N entries + their wraps + gaps to the region height together)
  if (Array.isArray(layer.lines) && layer.lines.length > 1) {
    const N = layer.lines.length;
    const dur = Math.max(1, (layer.frameEnd || (layer.frameStart + 120)) - layer.frameStart);
    const step = Math.min(26, Math.max(8, Math.floor(dur / N)));
    const lfs = fitStackedLines(layer.lines.map(ln => ln.text), 0);
    return (
      <div style={posStyle}>
        {layer.lines.map((ln, i) => {
          const lf = local - (ln.atFrame != null ? ln.atFrame : i * step);
          if (lf < 0) return null;
          const p = interpolate(lf, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const lwords = String(ln.text || '').split(/\s+/).filter(Boolean);
          const lkw = (ln.keyword || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const kwHit = (w) => lkw && w.toUpperCase().replace(/[^A-Z0-9]/g, '') === lkw;
          return (
            <div key={i} style={{ ...textBox, transform: `scale(${0.9 + 0.1 * p})`, opacity: p, fontWeight: 800, fontSize: lfs, lineHeight: 1.1, letterSpacing: '-0.5px', marginBottom: i === N - 1 ? 0 : LIST_GAP, ...STROKE }}>
              {lwords.flatMap((w, k) => { const sp = <span key={k} style={{ color: kwHit(w) ? kwColor : color }}>{w}</span>; return k === 0 ? [sp] : [' ', sp]; })}
            </div>
          );
        })}
      </div>
    );
  }

  const hasCorrection = style2 === 'strike_correct' && layer.correction;
  const hasAnnotation = !!layer.annotation;
  // underline draws BELOW the text baseline (~0.18×fs) — reserve for it now that the
  // region hard-clips, so the bar can't be cut off at the bottom edge
  const extraFrac = (hasCorrection ? 0.42 : 0) + (hasAnnotation ? 0.16 : 0) + (style2 === 'underline' ? 0.12 : 0);
  const titleText = style2 === 'quote' ? `“${layer.title}”` : layer.title;
  const words = String(titleText || '').split(/\s+/).filter(Boolean);
  const fs = fitFont(titleText, extraFrac);

  // strike/underline draw timing: at the keyword moment (absolute keywordFrame from
  // the Timing Director), else shortly after the title lands.
  const markStart = (layer.keywordFrame != null ? layer.keywordFrame : layer.frameStart + 12) - layer.frameStart;
  const markP = interpolate(local, [markStart, markStart + 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingFn('easeOutCubic') });
  const corrP = spring({ frame: Math.max(0, local - (markStart + 8)), fps, config: { damping: 10, stiffness: 130, mass: 0.8 }, durationInFrames: 10 });

  const p = interpolate(local, [0, 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const unit = words.length <= 3;

  return (
    <div style={posStyle}>
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <div style={{ ...textBox, transform: unit ? `scale(${0.82 + 0.18 * p})` : undefined, opacity: unit ? p : 1,
          fontWeight: 800, fontSize: fs, lineHeight: 1.08, letterSpacing: unit ? '-1px' : '-0.5px',
          fontStyle: style2 === 'quote' ? 'italic' : 'normal', ...STROKE }}>
          {renderWords(words, !unit)}
        </div>
        {style2 === 'strike_correct' && markP > 0 ? (
          <div style={{ position: 'absolute', left: '2%', top: '46%', width: `${96 * markP}%`, height: Math.max(5, fs * 0.09), background: kwColor, borderRadius: 4, transform: 'rotate(-2deg)' }} />
        ) : null}
        {style2 === 'underline' && markP > 0 ? (
          <div style={{ position: 'absolute', left: '4%', bottom: -Math.max(6, fs * 0.10), width: `${92 * markP}%`, height: Math.max(5, fs * 0.08), background: kwColor, borderRadius: 4 }} />
        ) : null}
      </div>
      {hasCorrection && corrP > 0.02 ? (
        <div style={{ ...textBox, marginTop: fs * 0.10, fontWeight: 800, fontSize: fs * 0.92, lineHeight: 1.05,
          color: kwColor, transform: `scale(${1.5 - 0.5 * Math.min(1, corrP)})`, opacity: Math.min(1, corrP * 1.4), ...STROKE }}>
          {layer.correction}
        </div>
      ) : null}
      {hasAnnotation ? (
        <div style={{ ...textBox, marginTop: fs * 0.10, fontWeight: 600, fontStyle: 'italic', fontSize: Math.max(18, fs * 0.30),
          color: color, opacity: interpolate(local, [markStart + 6, markStart + 14], [0, 0.85], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          {layer.annotation}
        </div>
      ) : null}
    </div>
  );
}

// CONTAINMENT INVARIANT: the caption pill self-contains (maxWidth 88%, fixed font size).
function CaptionV2({ layer, frame, theme, H }) {
  const g = (layer.groups || []).find(gr => frame >= gr.startFrame && frame < gr.endFrame);
  if (!g) return null;
  const fsz = Math.max(24, Math.round(H * 0.0156));
  return (
    <div style={{ position: 'absolute', bottom: '12%', left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ background: layer.pill_fill || 'rgba(18,18,18,0.92)', borderRadius: 18, padding: '14px 30px', maxWidth: '88%' }}>
        <span style={{ fontWeight: 700, fontSize: fsz, letterSpacing: '-0.3px' }}>
          {g.words.map((w, i) => {
            const active = frame >= w.startFrame && frame < w.endFrame;
            const baseCol = layer.color || '#fff';
            const col = w.keyword ? (layer.keyword_color || theme.accent) : (active ? baseCol : 'rgba(255,255,255,0.82)');
            return <span key={i} style={{ color: col, margin: '0 6px' }}>{w.word}</span>;
          })}
        </span>
      </div>
    </div>
  );
}

// ── v2 effect renderers (all frame-driven; rationed upstream) ────────────────
// deterministic pseudo-noise from the frame number (no Math.random)
const noise = (f, seed) => Math.sin(f * 12.9898 + seed * 78.233) * 0.5 + Math.sin(f * 4.7 + seed * 31.7) * 0.5;

function activeEffects(effects, frame) {
  return (effects || []).filter(e => frame >= e.frameStart && frame < e.frameEnd);
}
function cameraEffectDelta(effects, frame) {
  let dx = 0, dy = 0, dScale = 0;
  activeEffects(effects, frame).forEach(e => {
    if (e.type === 'shake') {
      const amp = (e.params && e.params.ampPx) || 14;
      const fall = 1 - (frame - e.frameStart) / Math.max(1, e.frameEnd - e.frameStart);   // decays out
      dx += amp * fall * noise(frame, 1); dy += amp * fall * noise(frame, 2);
    } else if (e.type === 'punch_in') {
      const to = ((e.params && e.params.scaleTo) || 1.10) - 1;
      const t = interpolate(frame, [e.frameStart, e.frameStart + Math.max(2, (e.frameEnd - e.frameStart) * 0.4)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingFn('easeOutQuart') });
      dScale += to * t;   // steps in fast and HOLDS to the window end
    }
  });
  return { dx, dy, dScale };
}

function EffectOverlays({ effects, frame, layers, theme, W, H }) {
  const act = activeEffects(effects, frame);
  if (!act.length) return null;
  // anchor for fire_aura: the character layer active at this frame
  const charL = (layers || []).find(l => l.kind === 'character' && frame >= l.frameStart && frame < l.frameEnd);
  const cx = (charL && charL.layout && charL.layout.x) != null ? charL.layout.x : W / 2;
  return (
    <>
      {act.map((e, i) => {
        if (e.type === 'glitch') {
          const bars = [0, 1, 2, 3].map(k => {
            const y = ((noise(frame + k * 3, k + 5) + 1) / 2) * H;
            const off = noise(frame, k + 9) * ((e.params && e.params.rgbSplitPx) || 6) * 3;
            return <div key={k} style={{ position: 'absolute', left: off, top: y, width: W, height: Math.max(3, H * 0.012), background: k % 2 ? 'rgba(155,27,27,0.35)' : 'rgba(255,255,255,0.5)', mixBlendMode: 'difference' }} />;
          });
          return <AbsoluteFill key={i} style={{ pointerEvents: 'none' }}>{bars}</AbsoluteFill>;
        }
        if (e.type === 'speed_lines') {
          const p = interpolate(frame, [e.frameStart, e.frameEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const lines = Array.from({ length: 14 }, (_, k) => {
            const ang = (k / 14) * Math.PI * 2;
            const r0 = Math.min(W, H) * 0.34, r1 = Math.min(W, H) * (0.5 + 0.16 * ((noise(k, 3) + 1) / 2));
            return <line key={k} x1={W / 2 + Math.cos(ang) * r0} y1={H / 2 + Math.sin(ang) * r0}
              x2={W / 2 + Math.cos(ang) * r1} y2={H / 2 + Math.sin(ang) * r1}
              stroke="#1A1A1A" strokeWidth={Math.max(3, W * 0.004)} strokeLinecap="round"
              style={{ opacity: 0.7 * Math.sin(Math.PI * Math.min(1, p * 1.2)) }} />;
          });
          return <svg key={i} width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{lines}</svg>;
        }
        if (e.type === 'fire_aura') {
          const pulse = 1 + 0.06 * Math.sin((2 * Math.PI * frame) / 24);
          const gw = W * 0.42 * pulse, gh = H * 0.55 * pulse;
          return <div key={i} style={{ position: 'absolute', left: cx - gw / 2, bottom: -gh * 0.12, width: gw, height: gh, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 50% 85%, rgba(255,140,26,0.55) 0%, rgba(255,80,20,0.28) 40%, rgba(255,60,0,0) 72%)',
            mixBlendMode: 'multiply', filter: 'blur(2px)' }} />;
        }
        return null;   // shake/punch_in handled in cameraEffectDelta
      })}
    </>
  );
}

function AudioTracks({ payload, fps }) {
  const au = payload.audio || {};
  return (
    <>
      {au.voiceover && (au.voiceover.localUrl || au.voiceover.url) ? <Audio src={au.voiceover.localUrl || au.voiceover.url} volume={au.voiceover.gain != null ? au.voiceover.gain : 1} /> : null}
      {au.bgm && (au.bgm.localUrl || au.bgm.url) ? <Audio src={au.bgm.localUrl || au.bgm.url} volume={au.bgm.gain != null ? au.bgm.gain : 0.15} loop /> : null}
      {(au.sfx || []).map((s, i) => {
        const file = s.file && (s.file.endsWith('.mp3') ? s.file : s.file + '.mp3');
        const src = s.localUrl || (file ? staticFile('assets/sfx/' + file) : null);
        return src ? <Sequence key={i} from={s.frame || 0} durationInFrames={Math.round(fps * 2)}><Audio src={src} volume={s.gain != null ? s.gain : 0.6} /></Sequence> : null;
      })}
    </>
  );
}

export const VideoComposerV2 = ({ payload }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  // Belt-and-braces beside validateFontIsLoaded: don't mount text layers until
  // Montserrat is confirmed loaded, so measureText can never cache fallback-font
  // widths (guards the <5-unique-chars validation blind spot in layout-utils).
  const [fontHandle] = useState(() => (typeof window !== 'undefined' ? delayRender('Montserrat for measureText') : null));
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    montserratReady().then(() => { if (alive) setFontsReady(true); if (fontHandle != null) continueRender(fontHandle); })
      .catch(() => { if (alive) setFontsReady(true); if (fontHandle != null) continueRender(fontHandle); });
    return () => { alive = false; };
  }, [fontHandle]);
  const theme = payload.theme || {};
  const assets = payload.assets || {};
  const effects = payload.effects || [];
  const cam = resolveCamera(payload.camera, frame);
  const eff = cameraEffectDelta(effects, frame);
  const camScale = cam.scale + eff.dScale;
  const layers = (payload.layers || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg_color || theme.secondary || '#FFFFFF', fontFamily: fontStack() }}>
      {layers.map((L, i) => {
        if (frame < L.frameStart || frame >= L.frameEnd) return null;
        let inner = null;
        if (L.kind === 'background') inner = <BaseLayerV layer={L} theme={theme} />;
        else if (L.kind === 'visual' || L.kind === 'icon' || L.kind === 'character') inner = <ImageLayerV2 layer={L} frame={frame} fps={fps} assets={assets} theme={theme} W={W} H={H} />;
        else if (L.kind === 'emphasis') inner = fontsReady ? <EmphasisV2 layer={L} frame={frame} fps={fps} theme={theme} W={W} H={H} /> : null;
        else if (L.kind === 'caption') inner = <CaptionV2 layer={L} frame={frame} theme={theme} H={H} />;
        if (!inner) return null;
        const style = L.camera_locked
          ? { transform: `scale(${camScale}) translate(${cam.x + eff.dx}px, ${eff.dy}px)`, transformOrigin: 'center center' }
          : (eff.dx || eff.dy ? { transform: `translate(${eff.dx * 0.4}px, ${eff.dy * 0.4}px)` } : undefined);
        return <AbsoluteFill key={L.id || i} style={style}>{inner}</AbsoluteFill>;
      })}
      <EffectOverlays effects={effects} frame={frame} layers={layers} theme={theme} W={W} H={H} />
      <AudioTracks payload={payload} fps={fps} />
    </AbsoluteFill>
  );
};
