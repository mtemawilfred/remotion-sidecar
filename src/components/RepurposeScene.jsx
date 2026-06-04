// ── components/RepurposeScene.jsx ────────────────────────────────────────────
// Remotion composition for the video repurposing freeze-and-explain format.
// render_type: 'REPURPOSE_SCENE'
//
// HOW THE FREEZE-AND-EXPLAIN MODEL WORKS:
//   Source video plays normally (LIVE segment) until a voiceover timestamp.
//   At that timestamp the video FREEZES on that exact frame (FREEZE segment).
//   While frozen: voiceover audio plays + karaoke captions advance word-by-word.
//   Then the video RESUMES from that point (next LIVE segment).
//   This repeats for every segment in the narration sequence.
//
// LAYOUT (1080 × 1920, 9:16 vertical):
//   Background      — white fills all space not covered by video
//   Video layer     — source video scaled to fill 1080px wide, letterboxed vertically
//                     Original audio is MUTED (volume=0) — voiceover replaces it
//   Lesson Title    — dark pill overlay, pinned to TOP of canvas, full duration
//                     Always visible regardless of source video aspect ratio
//   Captions        — dark pill overlay, pinned to BOTTOM of canvas, freeze only
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

  for (const seg of sequence) {
    const durationSec = seg.type === 'live'
      ? (seg.end_time - seg.start_time)
      : seg.duration;
    const frameCount = Math.ceil(durationSec * fps);

    segmentsWithFrames.push({ ...seg, frameStart: frameOffset, frameCount });
    frameOffset += frameCount;
  }

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#FFFFFF' }}>

      {/* ── VIDEO SEGMENTS ──────────────────────────────────────────────────
          Live and freeze segments rendered in sequence order.
          Each Sequence clips rendering to its time window. */}
      {segmentsWithFrames.map((seg, i) =>
        seg.type === 'live' ? (
          <LiveSegment
            key={i}
            seg={seg}
            srcUrl={srcUrl}
            fps={fps}
          />
        ) : (
          <FreezeSegment
            key={i}
            seg={seg}
            srcUrl={srcUrl}
            ctaUrl={ctaUrl}
            fps={fps}
            brand={brand}
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
function LiveSegment({ seg, srcUrl, fps }) {
  return (
    <Sequence from={seg.frameStart} durationInFrames={seg.frameCount}>
      <AbsoluteFill>
        <OffthreadVideo
          src={srcUrl}
          startFrom={Math.round(seg.start_time * fps)}
          endAt={Math.round(seg.end_time * fps)}
          volume={0}
          style={{
            width:     '100%',
            height:    '100%',
            objectFit: 'contain',
          }}
        />
      </AbsoluteFill>
    </Sequence>
  );
}


// ── FreezeSegment ──────────────────────────────────────────────────────────────
// Video frozen on seg.timestamp for the full segment duration.
// Voiceover audio plays from frame 0 of this Sequence.
// Karaoke captions advance word-by-word with the audio.
// CTA banner fades in if show_cta is true.
//
// KEY: <Freeze frame={N}> makes ALL its children behave as if the current
// Remotion frame is N. OffthreadVideo inside Freeze renders at time N/fps.
// Audio and captions are OUTSIDE Freeze so they advance normally.
function FreezeSegment({ seg, srcUrl, ctaUrl, fps, brand }) {
  const frozenVideoFrame = Math.round(seg.timestamp * fps);

  return (
    <Sequence from={seg.frameStart} durationInFrames={seg.frameCount}>

      {/* ── FROZEN VIDEO FRAME ────────────────────────────────────────────── */}
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

      {/* ── VOICEOVER AUDIO ───────────────────────────────────────────────── */}
      {/* Outside Freeze — advances from frame 0 of this Sequence.            */}
      {seg.audio_url && (
        <Audio src={seg.audio_url} />
      )}

      {/* ── KARAOKE CAPTIONS ─────────────────────────────────────────────── */}
      {/* Dark pill overlay pinned to bottom of canvas.                        */}
      {/* Renders on any aspect ratio — no letterbox dependency.              */}
      {seg.captions && seg.captions.length > 0 && (
        <KaraokeCaptions
          captions={seg.captions}
          fps={fps}
          brand={brand}
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


// ── KaraokeCaptions ──────────────────────────────────────────────────────────
// Word-by-word karaoke captions pinned to the bottom of the canvas.
// Dark semi-transparent pill background ensures readability on any surface:
// white letterbox space, chart content, or full-bleed portrait video.
//
// Active word: bright blue (#00D4FF), bold.
// Past words: white, dimmed (55% opacity).
// Future words: white, normal weight.
function KaraokeCaptions({ captions, fps, brand }) {
  const frame      = useCurrentFrame();
  const currentSec = frame / fps;

  // A word is "active" when its start ≤ currentSec < end
  const activeIdx = captions.findIndex(c =>
    currentSec >= c.start && currentSec < c.end
  );

  const fontFamily = brand.font_body || 'Inter';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:       'absolute',
          bottom:         CAPTION_BOTTOM,
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
            padding:       '24px 44px',
            maxWidth:      '100%',
            textAlign:     'center',
            lineHeight:    1.4,
          }}
        >
          {captions.map((cap, i) => (
            <span
              key={i}
              style={{
                display:    'inline',
                fontFamily: `${fontFamily}, Arial, sans-serif`,
                fontSize:   56,
                fontWeight: i === activeIdx ? 800 : 600,
                color:      i === activeIdx ? '#00D4FF' : '#FFFFFF',
                opacity:    i < activeIdx ? 0.55 : 1,
              }}
            >
              {cap.word}{' '}
            </span>
          ))}
        </div>
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