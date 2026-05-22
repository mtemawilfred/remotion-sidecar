// ── captions/CaptionSystem.jsx ────────────────────────────────────────────
// Three caption components — WordByWord, Highlight, Karaoke.
//
// KEY FIX: scene_start_ms
// All stt_timestamps are absolute ms from the start of the full voiceover.
// Inside a scene clip, useCurrentFrame() starts at 0, so currentMs goes
// from 0 to scene_duration_ms — never reaching e.g. 29,000ms.
//
// Fix: subtract scene_start_ms from every timestamp comparison.
// Relative word time = absolute_start_ms - scene_start_ms
// This makes every caption fire correctly from frame 0 of the clip.
//
// scene_start_ms is passed from SceneComposer → ElementsLayer → here.

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

// Groups words into lines of N words each
function groupWords(words, groupSize = 4) {
  const groups = [];
  for (let i = 0; i < words.length; i += groupSize) {
    groups.push(words.slice(i, i + groupSize));
  }
  return groups;
}

// ── WordByWordCaption ─────────────────────────────────────────────────────
// Groups of 3-5 words appear centered at bottom, synced to speech.
export const WordByWordCaption = ({
  stt_timestamps  = [],
  scene_start_ms  = 0,
  group_size      = 4,
  font_size       = 52,
  position_y_pct  = 0.82,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (stt_timestamps.length === 0) return null;

  // currentMs is local to this clip (starts at 0)
  const currentMs = (frame / fps) * 1000;
  const groups    = groupWords(stt_timestamps, group_size);

  // Find which group is currently active
  // Subtract scene_start_ms to convert absolute timestamps to local time
  let activeGroupIdx = -1;
  for (let i = 0; i < groups.length; i++) {
    const group      = groups[i];
    const groupStart = group[0].start_ms - scene_start_ms;
    const groupEnd   = (group[group.length - 1].end_ms || (group[0].start_ms + 2000)) - scene_start_ms;
    if (currentMs >= groupStart && currentMs <= groupEnd + 200) {
      activeGroupIdx = i;
      break;
    }
  }

  if (activeGroupIdx === -1) return null;

  const group           = groups[activeGroupIdx];
  const text            = group.map(w => w.word).join(' ');
  const groupStartLocal = group[0].start_ms - scene_start_ms;
  const groupStartFrame = Math.round((groupStartLocal / 1000) * fps);
  const localF          = frame - groupStartFrame;
  const fadeIn          = interpolate(localF, [0, 6], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:      'absolute',
          left:          0,
          top:           height * position_y_pct,
          width,
          textAlign:     'center',
          fontFamily:    brand?.font_heading || 'Oswald',
          fontSize:      font_size,
          fontWeight:    700,
          color:         '#FFFFFF',
          opacity:       fadeIn,
          textTransform: 'uppercase',
          textShadow:    '0 2px 12px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8)',
          letterSpacing: 1,
          padding:       '0 40px',
          lineHeight:    1.2,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ── HighlightCaption ──────────────────────────────────────────────────────
// Word currently being spoken turns gold. Rest of group stays white.
export const HighlightCaption = ({
  stt_timestamps  = [],
  scene_start_ms  = 0,
  group_size      = 4,
  font_size       = 48,
  position_y_pct  = 0.82,
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
    const group      = groups[i];
    const groupStart = group[0].start_ms - scene_start_ms;
    const groupEnd   = (group[group.length - 1].end_ms || (group[0].start_ms + 2000)) - scene_start_ms;
    if (currentMs >= groupStart && currentMs <= groupEnd + 200) {
      activeGroupIdx = i;
      break;
    }
  }

  if (activeGroupIdx === -1) return null;

  const group           = groups[activeGroupIdx];
  const groupStartLocal = group[0].start_ms - scene_start_ms;
  const groupStartFrame = Math.round((groupStartLocal / 1000) * fps);
  const localF          = frame - groupStartFrame;
  const fadeIn          = interpolate(localF, [0, 6], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:       'absolute',
          left:           0,
          top:            height * position_y_pct,
          width,
          textAlign:      'center',
          fontFamily:     brand?.font_heading || 'Oswald',
          fontSize:       font_size,
          fontWeight:     700,
          opacity:        fadeIn,
          textTransform:  'uppercase',
          textShadow:     '0 2px 12px rgba(0,0,0,0.9)',
          letterSpacing:  1,
          padding:        '0 40px',
          lineHeight:     1.2,
          display:        'flex',
          justifyContent: 'center',
          flexWrap:       'wrap',
          gap:            '0 12px',
        }}
      >
        {group.map((wordObj, i) => {
          // Convert word timestamps to local scene time for comparison
          const wordStartLocal = wordObj.start_ms - scene_start_ms;
          const wordEndLocal   = (wordObj.end_ms || wordObj.start_ms + 500) - scene_start_ms;
          const isActive       = currentMs >= wordStartLocal && currentMs <= wordEndLocal;
          return (
            <span
              key={i}
              style={{
                color:   isActive ? gold : '#FFFFFF',
                display: 'inline-block',
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
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
// Current word fills left-to-right with gold as it is being spoken.
export const KaraokeCaption = ({
  stt_timestamps  = [],
  scene_start_ms  = 0,
  group_size      = 4,
  font_size       = 48,
  position_y_pct  = 0.82,
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
    const group      = groups[i];
    const groupStart = group[0].start_ms - scene_start_ms;
    const groupEnd   = (group[group.length - 1].end_ms || (group[0].start_ms + 2000)) - scene_start_ms;
    if (currentMs >= groupStart && currentMs <= groupEnd + 200) {
      activeGroupIdx = i;
      break;
    }
  }

  if (activeGroupIdx === -1) return null;

  const group           = groups[activeGroupIdx];
  const groupStartLocal = group[0].start_ms - scene_start_ms;
  const groupStartFrame = Math.round((groupStartLocal / 1000) * fps);
  const localF          = frame - groupStartFrame;
  const fadeIn          = interpolate(localF, [0, 6], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position:       'absolute',
          left:           0,
          top:            height * position_y_pct,
          width,
          textAlign:      'center',
          fontFamily:     brand?.font_heading || 'Oswald',
          fontSize:       font_size,
          fontWeight:     700,
          opacity:        fadeIn,
          textTransform:  'uppercase',
          textShadow:     '0 2px 12px rgba(0,0,0,0.9)',
          letterSpacing:  1,
          padding:        '0 40px',
          lineHeight:     1.2,
          display:        'flex',
          justifyContent: 'center',
          flexWrap:       'wrap',
          gap:            '0 12px',
        }}
      >
        {group.map((wordObj, i) => {
          // Convert to local scene time
          const wordStartLocal = wordObj.start_ms - scene_start_ms;
          const wordEndLocal   = (wordObj.end_ms || wordObj.start_ms + 400) - scene_start_ms;
          const wordDuration   = wordEndLocal - wordStartLocal;

          const fillPct = currentMs < wordStartLocal
            ? 0
            : currentMs > wordEndLocal
            ? 1
            : (currentMs - wordStartLocal) / wordDuration;

          const alreadyDone = currentMs > wordEndLocal;

          return (
            <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
              {/* White underlay */}
              <span style={{ color: '#FFFFFF' }}>{wordObj.word}</span>
              {/* Gold fill overlay, clipped by fill percentage */}
              {(fillPct > 0 || alreadyDone) && (
                <span
                  style={{
                    position:   'absolute',
                    left:       0,
                    top:        0,
                    color:      gold,
                    overflow:   'hidden',
                    width:      `${(alreadyDone ? 1 : fillPct) * 100}%`,
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