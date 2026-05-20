// ── layers/TextLayer.jsx ──────────────────────────────────────────────────
// Layer 4 — animated text overlays timed to STT word timestamps.
// Each text element specifies:
//   component    — FloatingLabel or TypewriterText
//   text         — the text to display
//   anchor_word  — the voiceover word at which this text appears
//   start_ms     — direct timestamp override (if no anchor_word)
//   position     — where on canvas (top_left, top_right, bottom_left, etc.)
//   style        — visual style variant (label, highlight, subtitle)
//
// The STT timestamps from sceneJson.stt_timestamps are used to resolve
// anchor_word references to exact frame numbers.

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

// Position presets — converts position string to CSS values
const POSITIONS = {
  top_left:      { top: '8%',  left: '5%',  alignItems: 'flex-start' },
  top_right:     { top: '8%',  right: '5%', alignItems: 'flex-end'   },
  top_center:    { top: '8%',  left: '50%', transform: 'translateX(-50%)' },
  bottom_left:   { bottom: '12%', left: '5%',  alignItems: 'flex-start' },
  bottom_right:  { bottom: '12%', right: '5%', alignItems: 'flex-end'   },
  bottom_center: { bottom: '12%', left: '50%', transform: 'translateX(-50%)' },
  center:        { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' },
  mid_left:      { top: '50%', left: '5%',  transform: 'translateY(-50%)' },
  mid_right:     { top: '50%', right: '5%', transform: 'translateY(-50%)' },
};

// Style variants
const STYLES = {
  label: {
    background:   'rgba(27,42,74,0.85)',
    color:        '#FFFFFF',
    fontSize:     28,
    fontWeight:   700,
    padding:      '8px 18px',
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  highlight: {
    background:   'rgba(201,168,76,0.90)',
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
    textShadow:   '0 2px 8px rgba(0,0,0,0.8)',
    padding:      '4px 12px',
  },
  danger: {
    background:   'rgba(153,27,27,0.85)',
    color:        '#FFFFFF',
    fontSize:     28,
    fontWeight:   700,
    padding:      '8px 18px',
    borderRadius: 6,
  },
};

export const TextLayer = ({ sceneJson, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textElements = sceneJson.layers?.text || [];
  const sttTimestamps = sceneJson.stt_timestamps || [];

  if (textElements.length === 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {textElements.map((el, i) => (
        <TextElement
          key={i}
          el={el}
          frame={frame}
          fps={fps}
          sttTimestamps={sttTimestamps}
          brand={brand}
        />
      ))}
    </AbsoluteFill>
  );
};

// ── Individual text element ────────────────────────────────────────────────
const TextElement = ({ el, frame, fps, sttTimestamps, brand }) => {
  // Resolve start frame from anchor_word or direct start_ms
  let startMs = el.start_ms || 0;

  if (el.anchor_word) {
    const match = sttTimestamps.find(
      t => t.word.toLowerCase() === el.anchor_word.toLowerCase()
    );
    if (match) startMs = match.start_ms;
  }

  const startFrame = Math.round((startMs / 1000) * fps);

  // Resolve end frame if specified
  const endFrame = el.end_ms
    ? Math.round((el.end_ms / 1000) * fps)
    : null;

  // Not yet visible
  if (frame < startFrame) return null;

  // Past end time
  if (endFrame && frame > endFrame) return null;

  const localFrame = frame - startFrame;

  // Fade in over 8 frames
  const opacity = interpolate(localFrame, [0, 8], [0, 1], {
    extrapolateLeft:  'clamp',
    extrapolateRight: 'clamp',
  });

  // Scale in from slightly small
  const scale = interpolate(localFrame, [0, 8], [0.85, 1], {
    extrapolateLeft:  'clamp',
    extrapolateRight: 'clamp',
  });

  const position = POSITIONS[el.position] || POSITIONS.top_left;
  const styleVariant = STYLES[el.style] || STYLES.label;

  return (
    <div
      style={{
        position:  'absolute',
        ...position,
        opacity,
        transform: `${position.transform || ''} scale(${scale})`,
        zIndex:    10,
      }}
    >
      <span
        style={{
          display:    'inline-block',
          fontFamily: brand.font_heading,
          ...styleVariant,
        }}
      >
        {el.text}
      </span>
    </div>
  );
};
