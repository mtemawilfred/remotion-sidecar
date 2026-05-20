// ── captions/CaptionSystem.jsx ────────────────────────────────────────────
// Three caption components replacing FFmpeg ASS captions.
// All read from stt_timestamps passed through the scene JSON.
// SceneComposer passes stt_timestamps to whichever caption component is active.
//
// Caption type is set in the scene JSON:
//   caption_type: "word_by_word" | "highlight" | "karaoke"
//
// The SceneComposer renders the correct caption component based on this field.

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

// Groups words into lines of N words each
function groupWords(words, groupSize = 4) {
  const groups = [];
  for (let i = 0; i < words.length; i += groupSize) {
    groups.push(words.slice(i, i + groupSize));
  }
  return groups;
}

// ── WordByWordCaption ─────────────────────────────────────────────────────
// Groups of 3-5 words appear centered at bottom.
// Synced to STT timestamps. Previous group fades out as new fades in.
// Exactly what the reference video uses.
//
// Props:
//   stt_timestamps  — [{ word, start_ms, end_ms }]
//   group_size      — words per group (default 4)
//   font_size       — caption font size (default 52)
//   position_y_pct  — vertical position 0-1 (default 0.82)
export const WordByWordCaption = ({
  stt_timestamps = [],
  group_size     = 4,
  font_size      = 52,
  position_y_pct = 0.82,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (stt_timestamps.length === 0) return null;

  const currentMs = (frame / fps) * 1000;
  const groups    = groupWords(stt_timestamps, group_size);

  // Find which group is currently active
  let activeGroupIdx = -1;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const groupStart = group[0].start_ms;
    const groupEnd   = group[group.length - 1].end_ms || (groupStart + 2000);
    if (currentMs >= groupStart && currentMs <= groupEnd + 200) {
      activeGroupIdx = i;
      break;
    }
  }

  if (activeGroupIdx === -1) return null;

  const group = groups[activeGroupIdx];
  const text  = group.map(w => w.word).join(' ');

  const groupStart = group[0].start_ms;
  const groupStartFrame = Math.round((groupStart / 1000) * fps);
  const localF = frame - groupStartFrame;
  const fadeIn = interpolate(localF, [0, 6], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const y = height * position_y_pct;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:   'absolute',
          left:       0,
          top:        y,
          width:      width,
          textAlign:  'center',
          fontFamily: brand?.font_heading || 'Oswald',
          fontSize:   font_size,
          fontWeight: 700,
          color:      '#FFFFFF',
          opacity:    fadeIn,
          textTransform: 'uppercase',
          textShadow: '0 2px 12px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8)',
          letterSpacing: 1,
          padding:    '0 40px',
          lineHeight: 1.2,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ── HighlightCaption ──────────────────────────────────────────────────────
// Same as WordByWordCaption but the word being spoken right now
// turns gold (brand.accent). Rest of group stays white.
// More dynamic — viewer's eye follows the speaking word.
export const HighlightCaption = ({
  stt_timestamps = [],
  group_size     = 4,
  font_size      = 48,
  position_y_pct = 0.82,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (stt_timestamps.length === 0) return null;

  const currentMs = (frame / fps) * 1000;
  const groups    = groupWords(stt_timestamps, group_size);
  const gold      = brand?.accent || '#C9A84C';

  let activeGroupIdx = -1;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const groupStart = group[0].start_ms;
    const groupEnd   = group[group.length - 1].end_ms || (groupStart + 2000);
    if (currentMs >= groupStart && currentMs <= groupEnd + 200) {
      activeGroupIdx = i;
      break;
    }
  }

  if (activeGroupIdx === -1) return null;

  const group = groups[activeGroupIdx];
  const groupStartFrame = Math.round((group[0].start_ms / 1000) * fps);
  const localF = frame - groupStartFrame;
  const fadeIn = interpolate(localF, [0, 6], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const y = height * position_y_pct;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:   'absolute',
          left:       0,
          top:        y,
          width:      width,
          textAlign:  'center',
          fontFamily: brand?.font_heading || 'Oswald',
          fontSize:   font_size,
          fontWeight: 700,
          opacity:    fadeIn,
          textTransform: 'uppercase',
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          letterSpacing: 1,
          padding:    '0 40px',
          lineHeight: 1.2,
          display:    'flex',
          justifyContent: 'center',
          flexWrap:   'wrap',
          gap:        '0 12px',
        }}
      >
        {group.map((wordObj, i) => {
          const isActive = currentMs >= wordObj.start_ms &&
            currentMs <= (wordObj.end_ms || wordObj.start_ms + 500);
          const scaleStyle = isActive
            ? { transform: 'scale(1.08)', display: 'inline-block' }
            : { display: 'inline-block' };
          return (
            <span
              key={i}
              style={{
                color: isActive ? gold : '#FFFFFF',
                ...scaleStyle,
                transition: 'color 0.05s',
              }}
            >
              {wordObj.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── KaraokeCaption ────────────────────────────────────────────────────────
// The current word fills with gold from left to right as it is being spoken.
// Uses start_ms and end_ms per word for the fill animation.
// Most impressive visual but requires accurate end_ms from STT.
export const KaraokeCaption = ({
  stt_timestamps = [],
  group_size     = 4,
  font_size      = 48,
  position_y_pct = 0.82,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (stt_timestamps.length === 0) return null;

  const currentMs = (frame / fps) * 1000;
  const groups    = groupWords(stt_timestamps, group_size);
  const gold      = brand?.accent || '#C9A84C';

  let activeGroupIdx = -1;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const groupStart = group[0].start_ms;
    const groupEnd   = group[group.length - 1].end_ms || (groupStart + 2000);
    if (currentMs >= groupStart && currentMs <= groupEnd + 200) {
      activeGroupIdx = i;
      break;
    }
  }

  if (activeGroupIdx === -1) return null;

  const group = groups[activeGroupIdx];
  const groupStartFrame = Math.round((group[0].start_ms / 1000) * fps);
  const localF = frame - groupStartFrame;
  const fadeIn = interpolate(localF, [0, 6], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const y = height * position_y_pct;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:   'absolute',
          left:       0,
          top:        y,
          width:      width,
          textAlign:  'center',
          fontFamily: brand?.font_heading || 'Oswald',
          fontSize:   font_size,
          fontWeight: 700,
          opacity:    fadeIn,
          textTransform: 'uppercase',
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          letterSpacing: 1,
          padding:    '0 40px',
          lineHeight: 1.2,
          display:    'flex',
          justifyContent: 'center',
          flexWrap:   'wrap',
          gap:        '0 12px',
        }}
      >
        {group.map((wordObj, i) => {
          const wordStart = wordObj.start_ms;
          const wordEnd   = wordObj.end_ms || wordObj.start_ms + 400;
          const wordDuration = wordEnd - wordStart;

          // How far through this word are we?
          const fillPct = currentMs < wordStart
            ? 0
            : currentMs > wordEnd
            ? 1
            : (currentMs - wordStart) / wordDuration;

          const alreadyDone = currentMs > wordEnd;

          return (
            <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
              {/* White underlay */}
              <span style={{ color: '#FFFFFF' }}>{wordObj.word}</span>
              {/* Gold overlay, clipped by fill percentage */}
              {(fillPct > 0 || alreadyDone) && (
                <span
                  style={{
                    position:  'absolute',
                    left:      0,
                    top:       0,
                    color:     gold,
                    overflow:  'hidden',
                    width:     `${(alreadyDone ? 1 : fillPct) * 100}%`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {wordObj.word}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
