// ── overlays/ColorWash.jsx ────────────────────────────────────────────────
// Transitions the background color by overlaying a colored wash.
// Used for section breaks or mood shifts between scenes.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const ColorWash = ({ color, start_ms=0, duration_ms=500, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF   = Math.round((start_ms/1000)*fps);
  const durF     = Math.round((duration_ms/1000)*fps);
  if (frame < startF) return null;
  const localF   = frame - startF;
  const opacity  = interpolate(localF,[0,durF/2,durF],[0,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const washColor = color || brand?.primary || '#1B2A4A';
  return (
    <AbsoluteFill style={{ backgroundColor:washColor, opacity, pointerEvents:'none' }} />
  );
};
