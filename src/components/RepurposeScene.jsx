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
  Freeze,
  Img,
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
        <LessonTitle title={lessonTitle} brand={brand} />
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


// ── FreezeSegment ──────────────────────────────────────────────────────────────
// Video frozen on seg.timestamp for the full segment duration.
// Voiceover audio plays from frame 0 of this Sequence.
// Talking captions: words pop into a speech bubble as they are spoken.
// CTA banner fades in if show_cta is true.
//
// KEY: <Freeze frame={N}> makes ALL its children behave as if the current
// Remotion frame is N. OffthreadVideo inside Freeze renders at time N/fps.
// Audio and captions are OUTSIDE Freeze so they advance normally.
function FreezeSegment({ seg, srcUrl, ctaUrl, fps, brand, layout, prevFx, whipOut }) {
  const frozenVideoFrame = Math.round(seg.timestamp * fps);
  // Called outside the Sequence → absolute frame; make it segment-relative.
  const t     = (useCurrentFrame() - seg.frameStart) / fps;
  const promo = productPopupState(t, productWindow(seg.captions, seg.duration));

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
        <Freeze frame={frozenVideoFrame}>
          <AbsoluteFill>
            <OffthreadVideo
              src={srcUrl}
              volume={0}
              style={{
                width:     '100%',
                height:    '100%',
                objectFit: 'contain',
              }}
            />
          </AbsoluteFill>
        </Freeze>
      </AbsoluteFill>

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
function LessonTitle({ title, brand }) {
  const fontFamily  = brand.font_heading || 'Oswald';
  const accentColor = brand.accent       || '#C9A84C';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
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