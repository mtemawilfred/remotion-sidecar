// ── PGPresentation.jsx ─────────────────────────────────────────────────────────
// PipsGravity "Play, Hold, Mark" long-form (1920×1080 @ 30fps). NEW composition, separate from
// RepurposeLongForm so that one stays available for rollback. Uses no shared primitives (nothing shared edited).
//
// IN (props, built by PipsGravity overlay/render-props.mjs from a VALIDATED edit-list@0.1.0):
//   { fps, durationInFrames, src:{w,h}, video, audio, beats[], captions[{w,a,z,gold?}], chapters[] }
//   beat = { id, a, z (narration ms), mode: hold|play|replay, from_ms, to_ms, cut, marks[], graphic, camera }
//   mark = { kind, at_ms, box:[x0,y0,x1,y1] in SOURCE px, below, text, carried }
// OUT: the video. The sidecar only draws; every time and position is decided upstream.
//
// Motion values follow the Play/Hold/Mark design v2 (PROPOSED, not approved standards): hold signal = white flash
// 0.8 -> 0 over 0.13 s + grey drain 0.7 s + HELD tag; marks draw on over 500 ms ease-out, 100 ms before the word;
// a mark dims to 40% after its beat and is gone one beat later (carried marks stay), and every mark goes on a cut;
// every card pushes the chart to 72% (500 ms) and sits beside it; zoom eases 800 ms onto the mark's box.
import React from 'react';
import { AbsoluteFill, Audio, Easing, Freeze, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';

// the design names Inter + Oswald; unloaded, the render box silently falls back to Arial/Impact
const { fontFamily: INTER } = loadInter('normal', { weights: ['700', '800'], subsets: ['latin'] });
const { fontFamily: OSWALD } = loadOswald('normal', { weights: ['700'], subsets: ['latin'] });
const W = 1920, H = 1080, NAVY = '#1B2A4A', GOLD = '#C9A84C', RED = '#C0392B', GREEN = '#1E8449', INK = '#0F172A';
const HEAD = `${OSWALD}, Impact, sans-serif`, BODY = `${INTER}, Arial, sans-serif`;
const PUSH = 0.72, PAD = 40, DRAW_MS = 500, LEAD_MS = 100, EASE_MS = 800;
const url = (s) => (/^https?:/.test(s) ? s : staticFile(s));
const c01 = (x) => Math.max(0, Math.min(1, x));
const out = Easing.out(Easing.cubic), io = Easing.inOut(Easing.cubic);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export const PGPresentation = (p) => {
  const frame = useCurrentFrame(), fps = p.fps, now = (frame / fps) * 1000, f = (ms) => Math.round((ms * fps) / 1000);
  const { beats, src } = p, S = Math.min(W / src.w, H / src.h), cw = src.w * S;
  const k = Math.max(0, beats.findIndex((b) => now >= b.a && now < b.z)), beat = beats[k];

  // push: merged spans of consecutive pushed beats, 500 ms in/out
  const pushed = beats.filter((b) => b.graphic).reduce((acc, b) => {
    const last = acc.at(-1); if (last && last[1] === b.a) last[1] = b.z; else acc.push([b.a, b.z]); return acc; }, []);
  const push = Math.max(0, ...pushed.map(([a, z]) => io(c01((now - a) / 500)) * io(c01((z - now) / 500))));
  const sc = S * (1 - (1 - PUSH) * push), left = interpolate(push, [0, 1], [(W - cw) / 2, PAD]), top = (H - src.h * sc) / 2;

  // camera: zoom onto the mark's box (source px), eased in and out inside the beat
  let zoom = 1, ox = src.w / 2, oy = src.h / 2;
  if (beat?.camera?.box) {
    const [x0, y0, x1, y1] = beat.camera.box, e = io(c01((now - beat.a) / EASE_MS)) * io(c01((beat.z - now) / EASE_MS));
    zoom = 1 + (beat.camera.scale - 1) * e; ox = (x0 + x1) / 2; oy = (y0 + y1) / 2;
  }
  // hold signal: first frame of a hold on a new frame
  const t0 = now - beat.a, signal = beat.mode === 'hold' && beat.cut;
  const grey = signal && t0 < 800 ? 1 - c01((t0 - 100) / 700) : 0, flash = signal ? Math.max(0, 0.8 - t0 / 130 * 0.8) : 0;

  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left, top, width: src.w, height: src.h, transform: `scale(${sc})`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `${ox}px ${oy}px`,
          filter: grey ? `grayscale(${grey.toFixed(2)})` : undefined }}>
          {beats.map((b) => (
            <Sequence key={b.id} from={f(b.a)} durationInFrames={Math.max(1, f(b.z) - f(b.a))} layout="none">
              {b.mode === 'hold'
                ? <Freeze frame={0}><Clip src={p.video} from={f(b.from_ms)} /></Freeze>
                : <Clip src={p.video} from={f(b.from_ms)} rate={(b.to_ms - b.from_ms) / (b.z - b.a)} />}
            </Sequence>
          ))}
          <Marks beats={beats} now={now} src={src} />
        </div>
      </div>
      {flash > 0 && <AbsoluteFill style={{ background: '#fff', opacity: flash }} />}
      {beat.mode === 'hold' && <Chip text="❚❚ HELD" style={{ right: 36, top: 32 }} />}
      {beats.filter((b) => b.graphic && now >= b.a - 400 && now < b.z + 300).map((b) =>
        <Card key={b.id} b={b} now={now} box={{ x: PAD + cw * PUSH + 24, y: 100, w: W - (PAD + cw * PUSH + 24) - 24, h: H - 260 }} />)}
      <Chapter chapters={p.chapters} now={now} />
      <Captions words={p.captions} now={now} fps={fps} />
      <Audio src={url(p.audio)} />
    </AbsoluteFill>
  );
};

const Clip = ({ src, from, rate = 1 }) => (
  <OffthreadVideo src={url(src)} startFrom={from} playbackRate={rate} muted style={{ width: '100%', height: '100%', display: 'block' }} />
);

// ── marks: SVG in source px, strokes in screen px (non-scaling) ─────────────────
function Marks({ beats, now, src }) {
  const live = [];
  beats.forEach((b, k) => b.marks.forEach((m, i) => {
    const cutAt = beats.slice(k + 1).find((x) => x.cut)?.a ?? Infinity, next = beats[k + 1];
    const gone = m.carried ? cutAt : Math.min(cutAt, next ? next.z : b.z);
    if (now < m.at_ms - LEAD_MS || now >= gone) return;
    live.push({ ...m, key: `${b.id}.${i}`, t: now - m.at_ms + LEAD_MS, p: out(c01((now - m.at_ms + LEAD_MS) / DRAW_MS)), o: now >= b.z && !m.carried ? 0.4 : 1 });
  }));
  return (
    <svg viewBox={`0 0 ${src.w} ${src.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      {live.map((m) => <g key={m.key} opacity={m.o}><Mark m={m} /></g>)}
    </svg>
  );
}

function Mark({ m }) {
  const [x0, y0, x1, y1] = m.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, p = m.p;
  const line = (d, color = GOLD, w = 6, dash) => (
    <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" vectorEffect="non-scaling-stroke"
      strokeDasharray={dash ? undefined : '1 1'} strokeDashoffset={dash ? undefined : 1 - p} style={dash ? { strokeDasharray: dash } : undefined} />
  );
  switch (m.kind) {
    case 'level': case 'underline': return line(`M${x0},${y0} L${x1},${y1}`);
    case 'ring': { const rx = Math.max(8, (x1 - x0) / 2), ry = Math.max(8, (y1 - y0) / 2);
      return line(`M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0`); }
    case 'zone': return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={GOLD} fillOpacity={0.3 * p} stroke={GOLD} strokeWidth={4}
      vectorEffect="non-scaling-stroke" strokeOpacity={p} />;
    case 'cross': return <g>{line(`M${x0},${y0} L${x1},${y1}`, RED, 8)}{p > 0.5 && line(`M${x1},${y0} L${x0},${y1}`, RED, 8)}</g>;
    case 'check': return line(`M${x0},${cy} L${cx - 2},${y1} L${x1 + 4},${y0 - 6}`, GREEN, 8);
    case 'path': case 'arrow': {
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - Math.abs(y1 - y0) * 0.6 - 6, a = Math.atan2(y1 - my, x1 - mx), h = 6;
      return <g>{line(`M${x0},${y0} Q${mx},${my} ${x1},${y1}`, GOLD, 5)}
        {p > 0.95 && <path d={`M${x1},${y1} l${-h * Math.cos(a - 0.5)},${-h * Math.sin(a - 0.5)} M${x1},${y1} l${-h * Math.cos(a + 0.5)},${-h * Math.sin(a + 0.5)}`}
          stroke={GOLD} strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinecap="round" />}</g>;
    }
    case 'term': case 'label': {
      // term types at ~11 chars/s; label pops 0.7 -> 1 with overshoot
      const txt = m.kind === 'term' ? m.text.slice(0, Math.floor((m.t / 1000) * 11) + 1) : m.text;
      const s = m.kind === 'label' ? 0.7 + 0.3 * Easing.out(Easing.back(1.8))(p) : 1, fs = 10, w = m.text.length * fs * 0.6 + 12;
      const ty = m.below ? y1 + 8 : y0 - 8 - fs * 1.6;
      return <g transform={`translate(${cx} ${ty + fs * 0.8}) scale(${s})`}>
        <rect x={-w / 2} y={-fs * 0.8} width={w} height={fs * 1.6} rx={3} fill={NAVY} stroke={GOLD} strokeWidth={3} vectorEffect="non-scaling-stroke" />
        <text x={0} y={fs * 0.35} fontSize={fs} fontFamily={HEAD} fill="#fff" textAnchor="middle" letterSpacing={0.5}>{txt.toUpperCase()}</text>
      </g>;
    }
    default: return null;
  }
}

// ── cards: parts appear on their spoken word; a highlight turns the said word gold ─
function Card({ b, now, box }) {
  const g = b.graphic, e = out(c01((now - b.a + 400) / 400)) * (1 - c01((now - b.z) / 300));
  const shownAt = (i) => g.steps.find((s) => s.kind === 'part' && s.part === i)?.at_ms ?? b.a;
  const hot = (i) => g.steps.filter((s) => s.kind === 'highlight' && s.part === i && now >= s.at_ms);
  const Part = ({ i, size, font = BODY, weight = 700 }) => {
    const pe = out(c01((now - shownAt(i)) / 300)), hs = hot(i);
    return (
      <div style={{ opacity: pe, transform: `translateY(${(1 - pe) * 24}px)`, fontFamily: font, fontSize: size, fontWeight: weight, lineHeight: 1.15, color: '#fff' }}>
        {g.parts[i].split(/(\s+)/).map((w, j) => {
          const h = hs.find((s) => norm(w) && (norm(w).startsWith(norm(s.word)) || norm(s.word).startsWith(norm(w))));
          const pop = h ? 1 + 0.12 * Math.max(0, 1 - (now - h.at_ms) / 300) : 1;
          return <span key={j} style={h ? { color: GOLD, display: 'inline-block', transform: `scale(${pop})`, textShadow: `0 0 18px ${GOLD}88` } : undefined}>{w}</span>;
        })}
      </div>
    );
  };
  const n = g.parts.length;
  let body;
  if (g.treatment === 'p-title') body = <><Part i={0} size={64} font={HEAD} weight={600} />
    <div style={{ height: 8, marginTop: 18, background: GOLD, width: `${out(c01((now - b.a) / 600)) * 100}%` }} /></>;
  else if (g.treatment === 'p-compare') body = <div style={{ display: 'flex', gap: 20 }}>{g.parts.slice(0, 2).map((_, i) =>
    <div key={i} style={{ flex: 1, borderTop: `8px solid ${i ? GREEN : RED}`, paddingTop: 20 }}><Part i={i} size={30} /></div>)}</div>;
  else body = g.parts.map((_, i) => <React.Fragment key={i}>
    {i > 0 && g.treatment === 'p-diagram' && <div style={{ color: GOLD, fontSize: 40, lineHeight: 1, margin: '8px 0', opacity: out(c01((now - shownAt(i)) / 300)) }}>↓</div>}
    <div style={{ marginTop: i && g.treatment !== 'p-diagram' ? 22 : 0 }}><Part i={i} size={n > 2 ? 36 : 40} /></div>
  </React.Fragment>);
  return (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, display: 'flex', alignItems: 'center', opacity: e,
      transform: `translateX(${(1 - e) * 40}px)` }}>
      <div style={{ width: '100%', background: `${NAVY}F0`, borderLeft: `10px solid ${GOLD}`, borderRadius: 18, padding: '32px 30px',
        boxShadow: '0 20px 50px rgba(0,0,0,.35)' }}>{body}</div>
    </div>
  );
}

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
