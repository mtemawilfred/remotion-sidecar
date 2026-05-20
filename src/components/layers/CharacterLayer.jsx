// ── layers/CharacterLayer.jsx ─────────────────────────────────────────────
// Layer 2 — the astronaut character pose.
// Loads the pose PNG from base64 (passed in the scene JSON assets block).
// Applies the specified animation to the entire pose as one unit:
//   float    — gentle up/down float loop
//   shake    — left/right shake loop
//   bounce   — one-time bounce in from bottom
//   scale    — dramatic punch-in scale
//   slide_in — slides in from a direction
//   none     — static, no animation
//
// Position and scale are controlled by character.position and character.scale
// in the scene JSON. Defaults to centered, full height.

import React from 'react';
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';

export const CharacterLayer = ({ sceneJson, brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const character = sceneJson.layers?.character;

  // No character in this scene
  if (!character || !sceneJson.assets?.pose_png_b64) return null;

  const animation  = character.animation  || 'float';
  const posX       = character.position_x !== undefined ? character.position_x : 0.5;
  const posY       = character.position_y !== undefined ? character.position_y : 0.5;
  const scale      = character.scale      || 1.0;
  const startFrame = Math.round(((character.start_ms || 0) / 1000) * fps);

  // Don't render before the character's start frame
  if (frame < startFrame) return null;
  const localFrame = frame - startFrame;

  // ── Animation transforms ─────────────────────────────────────────────────

  let translateY = 0;
  let translateX = 0;
  let scaleValue = scale;
  let opacity    = 1;

  if (animation === 'float') {
    // Gentle sine-wave float — 2-second cycle
    const cycleFrames = fps * 2;
    translateY = Math.sin((localFrame / cycleFrames) * Math.PI * 2) * 12;
  }

  if (animation === 'shake') {
    // Quick left-right shake — 0.5-second cycle
    const cycleFrames = fps * 0.5;
    translateX = Math.sin((localFrame / cycleFrames) * Math.PI * 2) * 8;
  }

  if (animation === 'bounce') {
    // One-time bounce in from below using spring physics
    const progress = spring({ frame: localFrame, fps, config: { damping: 10, stiffness: 100 } });
    translateY = interpolate(progress, [0, 1], [200, 0]);
    opacity    = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  }

  if (animation === 'scale') {
    // Dramatic punch-in scale
    const progress = spring({ frame: localFrame, fps, config: { damping: 8, stiffness: 120 } });
    scaleValue = interpolate(progress, [0, 1], [0, scale]);
    opacity    = interpolate(localFrame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  }

  if (animation === 'slide_in') {
    // Slide in from the specified direction
    const dir         = character.slide_direction || 'from_right';
    const slideFrames = Math.round(((character.slide_duration_ms || 500) / 1000) * fps);
    const offset      = dir === 'from_right' ? 1408 : -1408;
    translateX = interpolate(
      localFrame,
      [0, slideFrames],
      [offset, 0],
      { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  if (animation === 'pulse') {
    // Breathing pulse scale
    const cycleFrames = fps * 1.5;
    const pulse = Math.sin((localFrame / cycleFrames) * Math.PI * 2);
    scaleValue = scale + pulse * 0.03;
  }

  return (
    <AbsoluteFill
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        pointerEvents:  'none',
      }}
    >
      <Img
        src={`data:image/png;base64,${sceneJson.assets.pose_png_b64}`}
        style={{
          // Position the character using percentage-based offsets
          position:  'absolute',
          left:      `${posX * 100}%`,
          top:       `${posY * 100}%`,
          transform: `translate(-50%, -50%) translateX(${translateX}px) translateY(${translateY}px) scale(${scaleValue})`,
          opacity,
          // Max height 90% of canvas so it never clips
          maxHeight: '90%',
          maxWidth:  '60%',
          objectFit: 'contain',
        }}
      />
    </AbsoluteFill>
  );
};
