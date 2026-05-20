// ── overlays/BackgroundBlur.jsx ───────────────────────────────────────────
// Blurs the entire base layer at a timestamp. Used without a spotlight.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const BackgroundBlur = ({ blur_amount=8, start_ms=0, transition_ms=400, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF  = Math.round((start_ms / 1000) * fps);
  const transF  = Math.round((transition_ms / 1000) * fps);
  if (frame < startF) return null;
  const localF  = frame - startF;
  const blur    = interpolate(localF, [0, transF], [0, blur_amount], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  return (
    <AbsoluteFill style={{ backdropFilter:`blur(${blur}px)`, WebkitBackdropFilter:`blur(${blur}px)`, pointerEvents:'none' }} />
  );
};
