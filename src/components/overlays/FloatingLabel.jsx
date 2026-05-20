// ── overlays/FloatingLabel.jsx ────────────────────────────────────────────
// Standalone floating text label that appears at a specified position
// and timestamp. Fades and scales in over 8 frames.
// Used both as a standalone element in ElementsLayer and internally
// by TextLayer for STT-timed text overlays.
//
// Props:
//   text         — text to display
//   position     — position key: top_left, top_right, bottom_left,
//                  bottom_right, top_center, bottom_center, center,
//                  mid_left, mid_right
//   style        — visual style: label (navy), highlight (gold),
//                  subtitle (white transparent), danger (red)
//   start_ms     — when the label appears
//   end_ms       — when it disappears (optional — stays for rest of scene)
//   anchor_word  — STT word to anchor timing to (overrides start_ms)
//   stt_timestamps — array of { word, start_ms } objects from scene JSON

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

// Position presets — converts position string to absolute CSS values
const POSITIONS = {
  top_left:      { top: '8%',     left: '5%'                                      },
  top_right:     { top: '8%',     right: '5%'                                     },
  top_center:    { top: '8%',     left: '50%',    transform: 'translateX(-50%)'   },
  bottom_left:   { bottom: '12%', left: '5%'                                      },
  bottom_right:  { bottom: '12%', right: '5%'                                     },
  bottom_center: { bottom: '12%', left: '50%',    transform: 'translateX(-50%)'   },
  center:        { top: '50%',    left: '50%',    transform: 'translate(-50%,-50%)'},
  mid_left:      { top: '50%',    left: '5%',     transform: 'translateY(-50%)'   },
  mid_right:     { top: '50%',    right: '5%',    transform: 'translateY(-50%)'   },
};

// Style variants — visual treatment of the label
const STYLES = {
  label: {
    background:    'rgba(27,42,74,0.88)',
    color:         '#FFFFFF',
    fontSize:      28,
    fontWeight:    700,
    padding:       '8px 18px',
    borderRadius:  6,
    letterSpacing: 0.5,
  },
  highlight: {
    background:   'rgba(201,168,76,0.92)',
    color:        '#1B2A4A',
    fontSize:     32,
    fontWeight:   700,
    padding:      '8px 20px',
    borderRadius: 6,
  },
  subtitle: {
    background:   'transparent',
    color:        '#FFFFFF',
    fontSize:     24,
    fontWeight:   400,
    textShadow:   '0 2px 8px rgba(0,0,0,0.85)',
    padding:      '4px 12px',
  },
  danger: {
    background:   'rgba(153,27,27,0.88)',
    color:        '#FFFFFF',
    fontSize:     28,
    fontWeight:   700,
    padding:      '8px 18px',
    borderRadius: 6,
  },
};

export const FloatingLabel = ({
  text            = '',
  position        = 'top_left',
  style           = 'label',
  start_ms        = 0,
  end_ms,
  anchor_word,
  stt_timestamps  = [],
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Resolve start time from anchor_word if provided
  let resolvedStartMs = start_ms;
  if (anchor_word && stt_timestamps.length > 0) {
    const match = stt_timestamps.find(
      t => t.word.toLowerCase() === anchor_word.toLowerCase()
    );
    if (match) resolvedStartMs = match.start_ms;
  }

  const startFrame = Math.round((resolvedStartMs / 1000) * fps);
  const endFrame   = end_ms ? Math.round((end_ms / 1000) * fps) : null;

  // Not yet visible
  if (frame < startFrame) return null;

  // Past end time
  if (endFrame && frame > endFrame) return null;

  const localFrame = frame - startFrame;

  // Fade in and scale up over 8 frames
  const opacity = interpolate(localFrame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const scale = interpolate(localFrame, [0, 8], [0.85, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const pos        = POSITIONS[position] || POSITIONS.top_left;
  const styleObj   = STYLES[style]       || STYLES.label;
  const baseTransform = pos.transform    || '';

  return (
    <div
      style={{
        position:  'absolute',
        ...pos,
        opacity,
        transform: `${baseTransform} scale(${scale})`,
        zIndex:    10,
      }}
    >
      <span
        style={{
          display:    'inline-block',
          fontFamily: brand?.font_heading || 'Oswald',
          ...styleObj,
        }}
      >
        {text}
      </span>
    </div>
  );
};
