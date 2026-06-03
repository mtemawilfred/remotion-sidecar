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
//   Background   — dark navy (#1B2A4A) fills all space not covered by video
//   Video layer  — source video scaled to fill 1080px wide, letterboxed vertically
//   Captions     — bottom 300px margin, karaoke blue/white, freeze segments only
//   CTA banner   — 1080×110px pre-baked image, bottom 440px, CTA segment only
//   Audio        — each freeze segment plays its own WAV chunk
//
// SCENE JSON SHAPE received from renderer.js (after file setup):
// {
//   render_type:           'REPURPOSE_SCENE',
//   folder_name:           'VR_xxx',
//   source_video_url:      'http://localhost:PORT/public/tmp_renders/VR_xxx_ts/source.mp4',
//   cta_banner_url:        'http://localhost:PORT/public/tmp_renders/VR_xxx_ts/cta_banner.png',
//   fps:                   30,
//   canvas:                { w: 1080, h: 1920 },
//   duration_ms:           45000,
//   brand:                 { primary, accent, font_heading, font_body },
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

// ── Layout constants ─────────────────────────────────────────────────────────
const CANVAS_W        = 1080;
const CANVAS_H        = 1920;
const CAPTION_BOTTOM  = 300;  // px from bottom — captions sit at this margin
const CTA_BOTTOM      = 440;  // px from bottom — CTA banner position
const CTA_H           = 110;  // CTA banner height (matches Build CTA Banner1 output)

// ── RepurposeScene ───────────────────────────────────────────────────────────
// Top-level composition. Pre-calculates frame offsets for all segments,
// then renders each as either a LiveSegment or FreezeSegment.
export const RepurposeScene = ({ sceneJson }) => {
  const { fps } = useVideoConfig();

  const sequence   = sceneJson.sequence       || [];
  const srcUrl     = sceneJson.source_video_url;
  const ctaUrl     = sceneJson.cta_banner_url;
  const brand      = sceneJson.brand          || {};

  // ── Pre-calculate absolute frame offsets ──────────────────────────────────
  // Each segment needs a frameStart (composition frame where it begins) and
  // frameCount (how many frames it lasts). We walk the sequence once to build
  // these values. Math.ceil ensures we never drop a partial last frame.
  const segmentsWithFrames = [];
  let frameOffset = 0;

  for (const seg of sequence) {
    const durationSec  = seg.type === 'live'
      ? (seg.end_time - seg.start_time)
      : seg.duration;
    const frameCount   = Math.ceil(durationSec * fps);

    segmentsWithFrames.push({ ...seg, frameStart: frameOffset, frameCount });
    frameOffset += frameCount;
  }

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#FFFFFF' }}>
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
    </AbsoluteFill>
  );
};


// ── LiveSegment ───────────────────────────────────────────────────────────────
// Source video plays from start_time to end_time at normal speed.
// No captions, no audio overlay — those belong exclusively to freeze segments.
//
// startFrom / endAt: Remotion OffthreadVideo props.
//   startFrom={N} → skip the first N frames of the source video
//   endAt={M}     → stop at frame M of the source video
// The Sequence's durationInFrames clips rendering to the correct window.
function LiveSegment({ seg, srcUrl, fps }) {
  return (
    <Sequence from={seg.frameStart} durationInFrames={seg.frameCount}>
      <AbsoluteFill>
        <OffthreadVideo
          src={srcUrl}
          // startFrom: advance source video to start_time on frame 0 of this Sequence
          startFrom={Math.round(seg.start_time * fps)}
          // endAt: prevent the source video from playing past end_time
          endAt={Math.round(seg.end_time * fps)}
          style={{
            width:      '100%',
            height:     '100%',
            // contain: letterbox — landscape source video centred vertically
            // with dark navy background filling the unused vertical space
            objectFit:  'contain',
          }}
        />
      </AbsoluteFill>
    </Sequence>
  );
}


// ── FreezeSegment ──────────────────────────────────────────────────────────────
// Video is frozen on the frame at seg.timestamp for the full segment duration.
// Voiceover audio plays from frame 0 of this Sequence.
// Karaoke captions advance word-by-word with the audio.
// CTA banner fades in if show_cta is true.
//
// KEY: <Freeze frame={N}> makes ALL its children behave as if the current
// Remotion frame is N. OffthreadVideo inside Freeze renders video at time N/fps.
// Audio and captions are OUTSIDE Freeze so they advance normally.
function FreezeSegment({ seg, srcUrl, ctaUrl, fps, brand }) {
  // The source video frame number that corresponds to seg.timestamp
  const frozenVideoFrame = Math.round(seg.timestamp * fps);

  return (
    <Sequence from={seg.frameStart} durationInFrames={seg.frameCount}>

      {/* ── FROZEN VIDEO FRAME ────────────────────────────────────────────── */}
      {/* Freeze overrides useCurrentFrame for all children.                  */}
      {/* OffthreadVideo inside Freeze always renders video at frozenVideoFrame. */}
      <Freeze frame={frozenVideoFrame}>
        <AbsoluteFill>
          <OffthreadVideo
            src={srcUrl}
            style={{
              width:     '100%',
              height:    '100%',
              objectFit: 'contain',
            }}
          />
        </AbsoluteFill>
      </Freeze>

      {/* ── VOICEOVER AUDIO ───────────────────────────────────────────────── */}
      {/* Outside Freeze — plays from frame 0 of this Sequence.               */}
      {seg.audio_url && (
        <Audio src={seg.audio_url} />
      )}

      {/* ── KARAOKE CAPTIONS ─────────────────────────────────────────────── */}
      {/* Only rendered if this freeze segment has caption data.              */}
      {seg.captions && seg.captions.length > 0 && (
        <KaraokeCaptions
          captions={seg.captions}
          fps={fps}
          brand={brand}
        />
      )}

      {/* ── CTA BANNER ───────────────────────────────────────────────────── */}
      {/* Only rendered on the CTA freeze segment (show_cta: true).           */}
      {seg.show_cta && ctaUrl && (
        <CTABanner bannerUrl={ctaUrl} />
      )}

    </Sequence>
  );
}


// ── KaraokeCaptions ──────────────────────────────────────────────────────────
// Word-by-word karaoke caption display.
// Active word: bright blue (#00D4FF), bold.
// Past words: dimmed white (55% opacity).
// Future words: white, normal weight.
// All words in the segment are shown at once — CSS wraps to multiple lines.
function KaraokeCaptions({ captions, fps, brand }) {
  const frame      = useCurrentFrame();   // 0-indexed within parent Sequence
  const currentSec = frame / fps;         // seconds into this freeze segment

  // Find the index of the currently spoken word.
  // A word is "active" when its start ≤ currentSec < end.
  const activeIdx = captions.findIndex(c =>
    currentSec >= c.start && currentSec < c.end
  );

  const fontFamily = brand.font_body || 'Inter';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:   'absolute',
          bottom:     CAPTION_BOTTOM,
          left:       40,
          right:      40,
          textAlign:  'center',
          lineHeight: 1.3,
        }}
      >
        {captions.map((cap, i) => (
          <span
            key={i}
            style={{
              display:    'inline',
              fontFamily: `${fontFamily}, Arial, sans-serif`,
              fontSize:   64,
              fontWeight: i === activeIdx ? 800 : 600,
              color:      i === activeIdx ? '#00D4FF' : '#FFFFFF',
              // Soft text shadow for readability on any background
              textShadow: '0 2px 10px rgba(0,0,0,0.85)',
              // Dim words that have already been spoken
              opacity:    i < activeIdx ? 0.55 : 1,
            }}
          >
            {cap.word}{' '}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}


// ── CTABanner ────────────────────────────────────────────────────────────────
// Pre-baked 1080×110 CTA banner PNG rendered at bottom of the CTA freeze frame.
// Fast fade-in over 8 frames (0.27s at 30fps) so it doesn't feel abrupt.
function CTABanner({ bannerUrl }) {
  const frame        = useCurrentFrame();
  const FADE_FRAMES  = 8;
  const opacity      = Math.min(frame / Math.max(FADE_FRAMES, 1), 1);

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
