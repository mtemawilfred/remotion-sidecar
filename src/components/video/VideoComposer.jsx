// ── video/VideoComposer.jsx ───────────────────────────────────────────────
// v3 SINGLE-TIMELINE composition for NARRATOR_EXPLAINER. Renders the WHOLE video
// in one pass from Workflow B's fully-resolved payload (one POST -> one MP4).
// The sidecar is DUMB: every coordinate, frame range, scale, camera value and
// animation param was computed by Workflow B. This file only draws + interpolates.
// Layers are flat + z-ordered + frame-ranged; camera is a continuous track applied
// to camera_locked layers; captions/emphasis ride above the camera.
import React, { useState, useEffect } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Img, Audio, Sequence, staticFile, interpolate, delayRender, continueRender } from 'remotion';
import { measureText } from '@remotion/layout-utils';
import { resolveEntrance, resolveIdle, resolveCamera } from './motion';
import { loadFont } from '@remotion/google-fonts/Montserrat';

// Load Montserrat at the weights the components actually render (600/700/800).
// loadFont injects the @font-face AND registers a Remotion delayRender, so frames
// are not snapshotted before the font is ready in headless Chromium.
const { fontFamily: MONTSERRAT } = loadFont('normal', { weights: ['600', '700', '800'], subsets: ['latin'] });

const W = 1080, H = 1920;
const fontStack = () => `${MONTSERRAT}, 'Helvetica Neue', Arial, sans-serif`;

// ── minimal built-in glyph set (icon_name keyed; brand-colored) ────────────
function Glyph({ name, size, color }) {
  const s = size || 96, c = color || '#9B1B1B', sw = Math.max(4, s * 0.07);
  const P = { fill: 'none', stroke: c, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    arrow_down:  <g {...P}><line x1="50" y1="20" x2="50" y2="78"/><polyline points="30,58 50,80 70,58"/></g>,
    arrow_up:    <g {...P}><line x1="50" y1="80" x2="50" y2="22"/><polyline points="30,42 50,20 70,42"/></g>,
    money:       <g {...P}><line x1="50" y1="18" x2="50" y2="82"/><path d="M64 32 C64 24 56 22 50 22 C44 22 36 26 36 36 C36 46 50 48 50 48 C50 48 66 50 66 62 C66 72 56 78 50 78 C42 78 36 74 36 66"/></g>,
    lock:        <g {...P}><rect x="28" y="46" width="44" height="36" rx="6"/><path d="M38 46 V36 a12 12 0 0 1 24 0 V46"/></g>,
    warning:     <g {...P}><path d="M50 22 L80 76 H20 Z"/><line x1="50" y1="44" x2="50" y2="60"/><circle cx="50" cy="68" r="1.5" fill={c}/></g>,
    check:       <g {...P}><polyline points="26,52 44,70 76,32"/></g>,
    cross:       <g {...P}><line x1="32" y1="32" x2="68" y2="68"/><line x1="68" y1="32" x2="32" y2="68"/></g>,
    heart:       <g {...P}><path d="M50 78 C20 56 26 30 44 30 C50 30 50 36 50 36 C50 36 50 30 56 30 C74 30 80 56 50 78 Z"/></g>,
    chain:       <g {...P}><rect x="24" y="40" width="28" height="20" rx="10"/><rect x="48" y="40" width="28" height="20" rx="10"/></g>,
    broken_chain:<g {...P}><rect x="22" y="40" width="22" height="20" rx="10"/><rect x="56" y="40" width="22" height="20" rx="10"/><line x1="46" y1="42" x2="54" y2="58"/></g>,
    brain:       <g {...P}><path d="M40 30 C30 30 26 40 30 46 C24 50 26 62 34 64 C34 74 48 76 50 68 V32 C48 26 44 30 40 30 Z"/><path d="M60 30 C70 30 74 40 70 46 C76 50 74 62 66 64 C66 74 52 76 50 68"/></g>,
    clock:       <g {...P}><circle cx="50" cy="50" r="30"/><polyline points="50,32 50,50 64,58"/></g>,
    mirror:      <g {...P}><ellipse cx="50" cy="46" rx="20" ry="28"/><line x1="50" y1="74" x2="50" y2="84"/><line x1="38" y1="84" x2="62" y2="84"/></g>,
  };
  return (
    <div style={{ width: s, height: s, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', border: `${sw}px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 100 100" width={s * 0.62} height={s * 0.62}>{paths[name] || <circle cx="50" cy="50" r="8" fill={c} />}</svg>
    </div>
  );
}

// v4 (S1): a flat background paints its EXPLICIT color — Workflow B now sends
// background.color = '#FFFFFF' on every scene. Falls back to theme.bg_color, then
// white. The cinematic gradient is kept only for legacy payloads with no color.
function BaseLayerV({ layer, theme, frame }) {
  const bg = layer.background || { type: 'flat' };
  const drift = (layer.idle && layer.idle.periodFrames) ? 10 * Math.sin((2 * Math.PI * frame) / layer.idle.periodFrames) : 0;
  if (bg.type === 'cinematic' && !bg.color) {
    return <AbsoluteFill style={{ background: `linear-gradient(180deg, ${theme.primary || '#1A1A1A'} 0%, ${theme.accent || '#9B1B1B'} 150%)`, transform: `translateX(${drift}px)` }} />;
  }
  return <AbsoluteFill style={{ backgroundColor: bg.color || theme.bg_color || '#FFFFFF' }} />;
}

// v4 (S3): trim transparent padding from a character PNG so it bottom-anchors on the
// VISIBLE pixels (GAP-1: poses rendered small/floating above the bottom edge). Measures
// the alpha bbox once per src via an offscreen canvas; fully graceful — if the canvas is
// tainted or the image fails, it returns null and the old behavior is used (never breaks
// a render). Result cached across frames/scenes.
const _trimCache = {};
function useAlphaTrim(src) {
  const [trim, setTrim] = useState(src && _trimCache[src] !== undefined ? _trimCache[src] : null);
  const [handle] = useState(() => (src && _trimCache[src] === undefined && typeof window !== 'undefined' ? delayRender(`trim:${src}`) : null));
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
            if (maxY < y) { for (let x = 0; x < c.width; x++) { if (data[(y * c.width + x) * 4 + 3] > 12) { maxY = y; break; } } }
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

// v4 (S5): collapse a layer's ownership-decay reframes into scale/opacity multipliers
// at the current frame. Each decay reframe = { atFrame, scaleMul, opacityMul, durationFrames }.
function applyReframes(reframes, frame) {
  let scaleMul = 1, opacityMul = 1;
  (reframes || []).forEach(r => {
    if (r.scaleMul == null && r.opacityMul == null) return;       // spatial reframe (handled by camera/layout) — skip
    const dur = Math.max(1, r.durationFrames || 10);
    const t = Math.min(1, Math.max(0, (frame - r.atFrame) / dur));
    if (t <= 0) return;
    if (r.scaleMul   != null) scaleMul   *= 1 + (r.scaleMul   - 1) * t;
    if (r.opacityMul != null) opacityMul *= 1 + (r.opacityMul - 1) * t;
  });
  return { scaleMul, opacityMul };
}

function ImageLayerV({ layer, frame, fps, assets, theme }) {
  const a = assets[layer.asset_ref];
  const lo = layer.layout || { x: W / 2, y: H / 2, scale: 0.4 };
  const local = frame - layer.frameStart;
  const ent = resolveEntrance(layer.entrance, local, fps);
  const idle = resolveIdle(layer.idle, frame);
  const isChar = layer.kind === 'character';

  // v4 (S3): scale up so the VISIBLE (trimmed) character fills heightPctTarget, then
  // shift down by the trimmed bottom padding so the content sits on the bottom edge.
  const trim = useAlphaTrim((isChar && a && (a.localUrl || a.url)) ? (a.localUrl || a.url) : null);
  const contentV = trim ? Math.max(0.2, 1 - (trim.top || 0) - (trim.bottom || 0)) : 1;

  const height = isChar ? ((lo.heightPctTarget || 0.70) * H) / contentV : undefined;
  const width  = isChar ? undefined : (lo.scale || 0.4) * W;
  const trimShiftY = (isChar && trim && height) ? (trim.bottom || 0) * height : 0;

  // v4 (S5): ownership-decay reframes — previous owner recedes (scale/opacity down) at
  // the handoff frame and stays mounted (no fade-out). Spatial reframes (with `to`) are
  // ignored here.
  const rf = applyReframes(layer.reframes, frame);

  const x = lo.x + ent.x + idle.x;
  const y = lo.y + ent.y + idle.y + trimShiftY;
  const scale = ent.scale * (1 + idle.scale) * rf.scaleMul;
  const rot = ent.rotation + idle.rotation;
  const anchorY = (isChar && lo.bottomAnchored) ? '-100%' : '-50%';
  const glow = idle.glow ? `drop-shadow(0 0 ${14 * idle.glow}px ${theme.accent || '#9B1B1B'})` : 'none';

  // v6: a non-character visual renders INSIDE its zone box (boxW x boxH) with objectFit
  // contain, so it can never overflow its region => disjoint zones guarantee no overlap.
  const boxW = (!isChar && lo.boxW) ? lo.boxW : width;
  const boxH = (!isChar && lo.boxH) ? lo.boxH : undefined;
  const layerOpacity = (lo.opacity != null ? lo.opacity : 1);

  let content = null;
  if (a && a.type === 'builtin') content = <Glyph name={a.name} size={(boxW || height || 96)} color={theme.accent} />;
  else if (a && (a.localUrl || a.url)) {
    if (isChar) {
      // C2: clamp the pose WIDTH so a wide pose (extended arm) can never leave the frame.
      const charMaxW = Math.min(W * 0.96, (lo.scale ? lo.scale * W * 1.6 : W * 0.96));
      const imgStyle = { height, width: 'auto', maxWidth: charMaxW, objectFit: 'contain', display: 'block' };
      if (ent.clip) { imgStyle.clipPath = ent.clip; imgStyle.WebkitClipPath = ent.clip; }
      content = <Img src={a.localUrl || a.url} style={imgStyle} />;
    } else if (lo.circle) {
      // v8: multi-visual list -> circular icon in a bordered circle (objectFit cover)
      const d = Math.min(boxW, boxH || boxW);
      content = <div style={{ width: d, height: d, borderRadius: '50%', overflow: 'hidden', border: `${Math.max(3, Math.round(d * 0.045))}px solid ${theme.primary || '#1A1A1A'}`, background: '#fff' }}><Img src={a.localUrl || a.url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>;
    } else {
      // C2: contain the visual inside its box, with the box CLAMPED to the frame so it can never overflow.
      const vW = Math.min(boxW || width || (W * 0.5), W);
      const vH = Math.min(boxH || vW, H);
      const imgStyle = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' };
      if (ent.clip) { imgStyle.clipPath = ent.clip; imgStyle.WebkitClipPath = ent.clip; }
      content = <div style={{ width: vW, height: vH }}><Img src={a.localUrl || a.url} style={imgStyle} /></div>;
    }
  }
  if (!content && layer.asset_ref) {
    // v10: asset failed to generate (empty url) but the ref is a built-in glyph name -> draw the glyph instead of a blank
    const GLYPHS = ['arrow_down','arrow_up','money','lock','warning','check','cross','heart','chain','broken_chain','brain','clock','mirror'];
    if (GLYPHS.indexOf(layer.asset_ref) !== -1) content = <Glyph name={layer.asset_ref} size={(boxW || height || 140)} color={theme.accent} />;
  }
  if (!content) return null;

  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, ${anchorY}) scale(${scale}) rotate(${rot}deg)`, opacity: ent.opacity * rf.opacityMul * layerOpacity, filter: glow }}>
      {content}
    </div>
  );
}

function EmphasisV({ layer, frame, fps, theme }) {
  const FORCE_UPPER = false;
  const local = frame - layer.frameStart;
  const ent = layer.entrance || {};
  const stag = Math.max(1, Math.round(((ent.wordStaggerMs || 90) / 1000) * fps));
  const color = layer.color || theme.title_color || '#1A1A1A';
  const kwColor = layer.keyword_color || theme.accent;
  const kw = (layer.keyword || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const isKwWord = (w) => kw && w.toUpperCase().replace(/[^A-Z0-9]/g, '') === kw;
  const STROKE = { WebkitTextStroke: '3px #FFFFFF', paintOrder: 'stroke' };
  const caseTf = FORCE_UPPER ? 'uppercase' : 'none';
  const FONT_FAMILY = MONTSERRAT;   // C1 fix: measure the ACTUAL rendered font (Montserrat), not Inter

  const containerW = ((layer.titleW != null ? layer.titleW : 0.88) * 1080) - 28;
  const regionH = (layer.titleH != null ? layer.titleH : 0.12) * 1920;

  // ---- MEASURED FIT: width at a reference size, scaled per candidate font size ----
  const REF = 100;
  const measureW = (text) => {
    try {
      return measureText({ text, fontFamily: FONT_FAMILY, fontSize: REF, fontWeight: 800, letterSpacing: '-0.5px' }).width;
    } catch (e) {
      return String(text).length * REF * 0.62;   // conservative fallback (still never crops)
    }
  };
  const LINE_H = 1.2;    // fit-math line height (render uses 1.08–1.12; the slack is stroke headroom)
  const LIST_GAP = 6;    // must match the title-list marginBottom below
  const PAD_V = 4;       // stroke-safe vertical padding on the clipped region container
  const fitStackedLines = (texts) => {
    // ONE uniform font size such that ALL stacked entries — each word-wrapping (greedy,
    // simulating the REAL wrap for the EXACT row count) — fit the region height TOGETHER,
    // and no single word exceeds the region width. N=1 is the plain title; N>1 is the
    // title-list. (The old per-line fitFont sized every list entry to the FULL region
    // height → N× overflow, clipped at the region edge.)
    const wWs = texts.map(t => String(t || '').split(/\s+/).filter(Boolean).map(w => measureW(w)));
    if (!wWs.some(ws => ws.length)) return 24;
    const availH = Math.max(1, (regionH - 2 * PAD_V) - (texts.length - 1) * LIST_GAP);
    const longestW = wWs.reduce((m, ws) => ws.reduce((m2, x) => Math.max(m2, x), m), 1);
    const spaceW = Math.max(1, measureW('x x') - measureW('xx'));           // space advance @REF
    const countRows = (ws, scale) => {
      if (!ws.length) return 0;
      let rows = 1, cur = 0;
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i] * scale;
        if (i === 0) cur = w;
        else if (cur + spaceW * scale + w <= containerW) cur += spaceW * scale + w;
        else { rows++; cur = w; }
      }
      return rows;
    };
    let fs = Math.min(240, Math.floor(availH / Math.max(1, texts.length)));
    for (let k = 0; k < 400 && fs > 10; k++) {
      const scale = fs / REF;
      const fitsW = longestW * scale <= containerW;                        // longest word fits -> never split mid-word
      const totalRows = wWs.reduce((s, ws) => s + countRows(ws, scale), 0); // ACTUAL wrapped row count, all entries
      const fitsH = totalRows * fs * LINE_H <= availH * 0.96;              // all rows fit the box height (+margin)
      if (fitsW && fitsH) break;
      fs -= 2;
    }
    return Math.max(10, fs);
  };
  const fitFont = (str) => fitStackedLines([str]);

  const posStyle = {
    position: 'absolute',
    top: (layer.titleY != null ? (layer.titleY * 100) + '%' : '7%'),
    left: (layer.titleX != null ? (layer.titleX * 100) + '%' : 0),
    width: (layer.titleW != null ? (layer.titleW * 100) + '%' : '100%'),
    height: (layer.titleH != null ? (layer.titleH * 100) + '%' : 'auto'),
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    // hard-clip at the region boundary ("every component fits its box"); the vertical
    // padding keeps the 3px white letter-stroke out of the clip edge.
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
  // sizes all N entries + their wraps + gaps to the region height together).
  if (Array.isArray(layer.lines) && layer.lines.length > 1) {
    const N = layer.lines.length;
    const dur = Math.max(1, (layer.frameEnd || (layer.frameStart + 120)) - layer.frameStart);
    const step = Math.min(26, Math.max(8, Math.floor(dur / N)));
    const lfs = fitStackedLines(layer.lines.map(ln => ln.text));
    return (
      <div style={posStyle}>
        {layer.lines.map((ln, i) => {
          const lf = local - (ln.atFrame != null ? ln.atFrame : i * step);
          if (lf < 0) return null;
          const p = interpolate(lf, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const sc = 0.9 + 0.1 * p;
          const lwords = String(ln.text || '').split(/\s+/).filter(Boolean);
          const lkw = (ln.keyword || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const kwHit = (w) => lkw && w.toUpperCase().replace(/[^A-Z0-9]/g, '') === lkw;
          return (
            <div key={i} style={{ ...textBox, transform: `scale(${sc})`, opacity: p, fontWeight: 800, fontSize: lfs, lineHeight: 1.1, textTransform: caseTf, letterSpacing: '-0.5px', marginBottom: LIST_GAP, ...STROKE }}>
              {lwords.flatMap((w, k) => { const sp = <span key={k} style={{ color: kwHit(w) ? kwColor : color }}>{w}</span>; return k === 0 ? [sp] : [' ', sp]; })}
            </div>
          );
        })}
      </div>
    );
  }

  const words = String(layer.title || '').split(/\s+/).filter(Boolean);
  const fs = fitFont(layer.title);

  // 3 words or fewer: pop in as a unit.
  if (words.length <= 3) {
    const p = interpolate(local, [0, 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const sc = 0.82 + 0.18 * p;
    return (
      <div style={posStyle}>
        <div style={{ ...textBox, transform: `scale(${sc})`, opacity: p, fontWeight: 800, fontSize: fs, lineHeight: 1.08, textTransform: caseTf, letterSpacing: '-1px', ...STROKE }}>
          {renderWords(words, false)}
        </div>
      </div>
    );
  }

  // >3 words: word-by-word build, uniform size, filling the region.
  return (
    <div style={posStyle}>
      <div style={{ ...textBox, fontWeight: 800, fontSize: fs, lineHeight: 1.12, textTransform: caseTf, letterSpacing: '-0.5px', ...STROKE }}>
        {renderWords(words, true)}
      </div>
    </div>
  );
}

function CaptionV({ layer, frame, theme }) {
  const g = (layer.groups || []).find(gr => frame >= gr.startFrame && frame < gr.endFrame);
  if (!g) return null;
  return (
    <div style={{ position: 'absolute', bottom: '12%', left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ background: layer.pill_fill || 'rgba(18,18,18,0.92)', borderRadius: 18, padding: '14px 30px', maxWidth: '88%' }}>
        <span style={{ fontWeight: 700, fontSize: 30, letterSpacing: '-0.3px' }}>
          {g.words.map((w, i) => {
            const active = frame >= w.startFrame && frame < w.endFrame;
            const baseCol = layer.color || '#fff';   // v4 (S2): readable on the white background (dark pill, light text)
            const col = w.keyword ? (layer.keyword_color || theme.accent) : (active ? baseCol : 'rgba(255,255,255,0.82)');
            return <span key={i} style={{ color: col, margin: '0 6px' }}>{w.word}</span>;
          })}
        </span>
      </div>
    </div>
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

export const VideoComposer = ({ payload }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = payload.theme || {};
  const assets = payload.assets || {};
  const cam = resolveCamera(payload.camera, frame);
  const layers = (payload.layers || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg_color || theme.secondary || '#FFFFFF', fontFamily: fontStack() }}>
      {layers.map((L, i) => {
        if (frame < L.frameStart || frame >= L.frameEnd) return null;   // life window
        let inner = null;
        if (L.kind === 'background') inner = <BaseLayerV layer={L} theme={theme} frame={frame} />;
        else if (L.kind === 'visual' || L.kind === 'icon' || L.kind === 'character') inner = <ImageLayerV layer={L} frame={frame} fps={fps} assets={assets} theme={theme} />;
        else if (L.kind === 'emphasis') inner = <EmphasisV layer={L} frame={frame} fps={fps} theme={theme} />;
        else if (L.kind === 'caption') inner = <CaptionV layer={L} frame={frame} theme={theme} />;
        if (!inner) return null;
        const style = L.camera_locked ? { transform: `scale(${cam.scale}) translateX(${cam.x}px)`, transformOrigin: 'center center' } : undefined;
        return <AbsoluteFill key={L.id || i} style={style}>{inner}</AbsoluteFill>;
      })}
      <AudioTracks payload={payload} fps={fps} />
    </AbsoluteFill>
  );
};