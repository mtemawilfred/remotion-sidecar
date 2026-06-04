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
//   Lesson Title    — rendered in the TOP white space for the full composition duration
//   Captions        — rendered in the BOTTOM white space, freeze segments only
//   CTA banner      — 1080×110px pre-baked image, bottom 440px, CTA segment only
//   Voiceover audio — each freeze segment plays its own WAV chunk
//   BGM             — background music at low volume, loops the full composition
//
// LETTERBOX LAYOUT:
//   For a source video of width W and height H, rendered on 1080×1920 with
//   objectFit:contain, the letterbox margin is:
//     renderedH      = round(1080 / (W/H))
//     letterboxMargin = floor((1920 - renderedH) / 2)
//   The title fills the top letterboxMargin px.
//   The captions fill the bottom letterboxMargin px.
//   source_width and source_height are passed in sceneJson from n8n.
//
// SCENE JSON SHAPE received from renderer.js (after file setup):
// {
//   render_type:       'REPURPOSE_SCENE',
//   folder_name:       'VR_xxx',
//   source_video_url:  'http://localhost:PORT/public/tmp_renders/VR_xxx_ts/source.mp4',
//   cta_banner_url:    'http://localhost:PORT/public/tmp_renders/VR_xxx_ts/cta_banner.png',
//   bg_music_url:      'http://localhost:PORT/public/assets/bgm/ambient_calm.mp3',
//   lesson_title:      'How To Trade BOS + Order Block Into BSL',
//   source_width:      720,
//   source_height:     720,
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

// CTA banner: 1080×110px pre-baked image, positioned near bottom of video area
const CTA_BOTTOM = 440;
const CTA_H      = 110;

// BGM volume: low enough to not compete with voiceover
const BGM_VOLUME = 0.10;


// ── RepurposeScene ───────────────────────────────────────────────────────────
// Top-level composition. Pre-calculates frame offsets for all segments,
// then renders each as either a LiveSegment or FreezeSegment.
// Lesson title and BGM are rendered at the root level (full composition duration).
export const RepurposeScene = ({ sceneJson }) => {
  const { fps } = useVideoConfig();

  const sequence    = sceneJson.sequence        || [];
  const srcUrl      = sceneJson.source_video_url;
  const ctaUrl      = sceneJson.cta_banner_url;
  const bgMusicUrl  = sceneJson.bg_music_url;
  const lessonTitle = sceneJson.lesson_title    || '';
  const brand       = sceneJson.brand           || {};

  // ── Calculate letterbox margin ─────────────────────────────────────────────
  // How much white space appears above and below the video due to objectFit:contain.
  // Used to position the lesson title (top) and captions (bottom) inside the
  // white space rather than overlapping the video.
  const sourceW        = sceneJson.source_width  || 720;
  const sourceH        = sceneJson.source_height || 720;
  const sourceAspect   = sourceW / sourceH;
  const renderedVideoH = Math.round(CANVAS_W / sourceAspect);
  // Clamp to 0: if source is taller than 1920px at full width (unlikely but safe)
  const letterboxMargin = Math.max(0, Math.floor((CANVAS_H - renderedVideoH) / 2));

  // ── Pre-calculate absolute frame offsets ──────────────────────────────────
  // Each segment needs a frameStart and frameCount. Walk the sequence once.
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
          Live and freeze segments are rendered in sequence order.
          Each Sequence component clips rendering to its time window. */}
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
            letterboxMargin={letterboxMargin}
          />
        )
      )}

      {/* ── LESSON TITLE ────────────────────────────────────────────────────
          Rendered outside any Sequence — visible for the full composition.
          Sits in the top letterbox white space above the video.
          Only rendered if letterbox margin is large enough to display cleanly. */}
      {lessonTitle && letterboxMargin > 60 && (
        <LessonTitle
          title={lessonTitle}
          letterboxMargin={letterboxMargin}
          brand={brand}
        />
      )}

      {/* ── BACKGROUND MUSIC ────────────────────────────────────────────────
          Rendered outside any Sequence — plays for the full composition.
          Low volume (BGM_VOLUME) so it never covers the voiceover.
          Loops if the composition is longer than the BGM track. */}
      {bgMusicUrl && (
        <Audio src={bgMusicUrl} volume={BGM_VOLUME} loop />
      )}

    </AbsoluteFill>
  );
};


// ── LiveSegment ───────────────────────────────────────────────────────────────
// Source video plays from start_time to end_time at normal speed.
// volume={0}: original audio is muted — voiceover replaces it.
// No captions, no audio overlay — those belong exclusively to freeze segments.
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
          // Mute original audio — voiceover is added separately on freeze segments
          volume={0}
          style={{
            width:     '100%',
            height:    '100%',
            // contain: letterbox — source video centred vertically
            // white background fills the unused vertical space
            objectFit: 'contain',
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
function FreezeSegment({ seg, srcUrl, ctaUrl, fps, brand, letterboxMargin }) {
  // The source video frame number that corresponds to seg.timestamp
  const frozenVideoFrame = Math.round(seg.timestamp * fps);

  return (
    <Sequence from={seg.frameStart} durationInFrames={seg.frameCount}>

      {/* ── FROZEN VIDEO FRAME ────────────────────────────────────────────── */}
      {/* Freeze overrides useCurrentFrame for all children.                  */}
      {/* OffthreadVideo inside Freeze always renders video at frozenVideoFrame. */}
      {/* volume={0}: original audio is muted — voiceover replaces it.        */}
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
      {/* Outside Freeze — advances normally from frame 0 of this Sequence.   */}
      {seg.audio_url && (
        <Audio src={seg.audio_url} />
      )}

      {/* ── KARAOKE CAPTIONS ─────────────────────────────────────────────── */}
      {/* Rendered in the bottom letterbox white space.                        */}
      {/* Only rendered if this freeze segment has caption data.              */}
      {seg.captions && seg.captions.length > 0 && letterboxMargin > 60 && (
        <KaraokeCaptions
          captions={seg.captions}
          fps={fps}
          brand={brand}
          letterboxMargin={letterboxMargin}
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


// ── LessonTitle ───────────────────────────────────────────────────────────────
// Displays the lesson title in the top white space for the entire composition.
// Centred vertically within the letterbox margin.
// Uses brand font (Oswald) and brand accent colour (gold).
function LessonTitle({ title, letterboxMargin, brand }) {
  const fontFamily = brand.font_heading || 'Oswald';
  const accentColor = brand.accent      || '#C9A84C';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:       'absolute',
          top:            0,
          left:           0,
          right:          0,
          height:         letterboxMargin,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '0 50px',
        }}
      >
        <div
          style={{
            fontFamily:    `${fontFamily}, Arial, sans-serif`,
            fontSize:      52,
            fontWeight:    700,
            color:         accentColor,
            textAlign:     'center',
            textTransform: 'uppercase',
            letterSpacing: 2,
            lineHeight:    1.2,
            // Subtle shadow so the title reads on any background colour
            textShadow:    '0 2px 10px rgba(0,0,0,0.4)',
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
}


// ── KaraokeCaptions ──────────────────────────────────────────────────────────
// Word-by-word karaoke caption display in the bottom letterbox white space.
// Active word: bright blue (#00D4FF), bold.
// Past words: dimmed white (55% opacity).
// Future words: white, normal weight.
// All words in the segment are shown at once — CSS wraps to multiple lines.
function KaraokeCaptions({ captions, fps, brand, letterboxMargin }) {
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
          // Pin to the bottom of the canvas; height matches the white space
          position:       'absolute',
          bottom:         0,
          left:           0,
          right:          0,
          height:         letterboxMargin,
          // Centre text vertically within the white space
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '0 44px',
          textAlign:      'center',
          lineHeight:     1.3,
        }}
      >
        <div>
          {captions.map((cap, i) => (
            <span
              key={i}
              style={{
                display:    'inline',
                fontFamily: `${fontFamily}, Arial, sans-serif`,
                fontSize:   56,
                fontWeight: i === activeIdx ? 800 : 600,
                color:      i === activeIdx ? '#00D4FF' : '#FFFFFF',
                // Text shadow for readability on the white background
                textShadow: i === activeIdx
                  ? '0 2px 12px rgba(0,0,0,0.9)'
                  : '0 2px 8px rgba(0,0,0,0.75)',
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
// Pre-baked 1080×110 CTA banner PNG rendered at bottom of the CTA freeze frame.
// Fast fade-in over 8 frames (0.27s at 30fps) so it doesn't feel abrupt.
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