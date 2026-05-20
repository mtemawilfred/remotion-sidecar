// ── overlays/GlowPulse.jsx ────────────────────────────────────────────────
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const GlowPulse = ({ pos_x=0.5, pos_y=0.5, color, radius=100, start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const startF = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF  = frame - startF;
  const cycleF  = fps * 1.2;
  const pulse   = 0.5 + 0.5 * Math.sin((localF / cycleF) * Math.PI * 2);
  const opacity = interpolate(localF,[0,10],[0,0.7],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const glowColor = color || brand?.accent || '#C9A84C';
  const cx = pos_x * width;
  const cy = pos_y * height;
  const r  = radius * (0.85 + pulse * 0.3);
  return (
    <AbsoluteFill style={{ pointerEvents:'none' }}>
      <svg width={width} height={height} style={{ position:'absolute', top:0, left:0 }}>
        <radialGradient id={`glow-${start_ms}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={glowColor} stopOpacity={opacity * 0.8}/>
          <stop offset="100%" stopColor={glowColor} stopOpacity="0"/>
        </radialGradient>
        <circle cx={cx} cy={cy} r={r} fill={`url(#glow-${start_ms})`}/>
      </svg>
    </AbsoluteFill>
  );
};
