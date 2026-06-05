// ── components/RepurposeLongForm.jsx ─────────────────────────────────────────
// Remotion composition for the long-form YouTube repurposing format.
// render_type: 'REPURPOSE_LONG_FORM'
//
// Identical to RepurposeScene.jsx except:
//   CANVAS_W / CANVAS_H  — 1920×1080 (16:9) instead of 1080×1920 (9:16)
//   TITLE_TOP            — 40px from top   (was 60px)
//   CAPTION_BOTTOM       — 40px from bottom (was 80px) — standard subtitle position
//   render_type          — 'REPURPOSE_LONG_FORM'
//
// Everything else — freeze-and-explain logic, BGM, voiceover, KaraokeCaptions
// (2 lines at a time), CTA hook (disabled via show_cta: false), pill styling —
// is identical to RepurposeScene.jsx.

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
const CANVAS_W = 1920;
const CANVAS_H = 1080;

// Caption pill: 40px from bottom — standard subtitle position (was 80px in RepurposeScene)
const CAPTION_BOTTOM = 40;

// CTA banner dimensions (kept for future use — show_cta is always false)
const CTA_BOTTOM = 200;
const CTA_H      = 110;

// BGM volume: low enough to never compete with voiceover
const BGM_VOLUME = 0.10;


// ── RepurposeLongForm ─────────────────────────────────────────────────────────
// Top-level composition. Pre-calculates frame offsets for all segments,
// then renders each as either a LiveSegment or FreezeSegment.
// No lesson title overlay — long-form YouTube videos don't use it.
// BGM is rendered at the root level (full composition duration).
export const RepurposeLongForm = ({ sceneJson }) => {
  const { fps } = useVideoConfig();

  const sequence   = sceneJson.sequence        || [];
  const srcUrl     = sceneJson.source_video_url;
  const ctaUrl     = sceneJson.cta_banner_url;
  const bgMusicUrl = sceneJson.bg_music_url;
  const brand      = sceneJson.brand           || {};

  // ── Pre-calculate absolute frame offsets ──────────────────────────────────
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

      {segmentsWithFrames.map((seg, i) =>
        seg.type === 'live' ? (
          <LiveSegment key={i} seg={seg} srcUrl={srcUrl} fps={fps} />
        ) : (
          <FreezeSegment key={i} seg={seg} srcUrl={srcUrl} ctaUrl={ctaUrl} fps={fps} brand={brand} />
        )
      )}

      {bgMusicUrl && (
        <Audio src={bgMusicUrl} volume={BGM_VOLUME} loop />
      )}

    </AbsoluteFill>
  );
};


// ── LiveSegment ───────────────────────────────────────────────────────────────
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


// ── FreezeSegment ─────────────────────────────────────────────────────────────
function FreezeSegment({ seg, srcUrl, ctaUrl, fps, brand }) {
  const frozenVideoFrame = Math.round(seg.timestamp * fps);

  return (
    <Sequence from={seg.frameStart} durationInFrames={seg.frameCount}>

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

      {seg.audio_url && (
        <Audio src={seg.audio_url} />
      )}

      {seg.captions && seg.captions.length > 0 && (
        <KaraokeCaptions captions={seg.captions} fps={fps} brand={brand} />
      )}

      {seg.show_cta && ctaUrl && (
        <CTABanner bannerUrl={ctaUrl} />
      )}

    </Sequence>
  );
}


// ── KaraokeCaptions ──────────────────────────────────────────────────────────
// 2 lines at a time — same logic as RepurposeScene.jsx.
// CAPTION_BOTTOM = 40px for standard subtitle position on 16:9 canvas.
function KaraokeCaptions({ captions, fps, brand }) {
  const frame      = useCurrentFrame();
  const currentSec = frame / fps;
  const fontFamily = brand.font_body || 'Inter';

  // ── Group captions into 2-line display chunks ──────────────────────────────
  const chunks = [];
  let current  = [];
  captions.forEach((cap) => {
    current.push(cap);
    const isBreak = /[.,!?;]$/.test(cap.word);
    if ((isBreak && current.length >= 3) || current.length >= 8) {
      chunks.push([...current]);
      current = [];
    }
  });
  if (current.length > 0) chunks.push(current);

  // ── Find active chunk ──────────────────────────────────────────────────────
  let activeChunkIdx = 0;
  chunks.forEach((chunk, idx) => {
    if (currentSec >= chunk[0].start) activeChunkIdx = idx;
  });

  const activeChunk = chunks[activeChunkIdx] || [];

  if (captions.length === 0 || currentSec < captions[0].start) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:       'absolute',
          bottom:         CAPTION_BOTTOM,
          left:           80,
          right:          80,
          display:        'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background:    'rgba(0, 0, 0, 0.62)',
            borderRadius:  20,
            padding:       '20px 48px',
            maxWidth:      '90%',
            textAlign:     'center',
            lineHeight:    1.4,
          }}
        >
          {activeChunk.map((cap, i) => {
            const isActive = currentSec >= cap.start && currentSec < cap.end;
            const isPast   = currentSec >= cap.end;
            return (
              <span
                key={i}
                style={{
                  display:    'inline',
                  fontFamily: `${fontFamily}, Arial, sans-serif`,
                  fontSize:   52,
                  fontWeight: isActive ? 800 : 600,
                  color:      isActive ? '#00D4FF' : '#FFFFFF',
                  opacity:    isPast ? 0.55 : 1,
                }}
              >
                {cap.word}{' '}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}


// ── CTABanner ────────────────────────────────────────────────────────────────
// Reserved for future use. show_cta is always false in long-form pipeline.
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
