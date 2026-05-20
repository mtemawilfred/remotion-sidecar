// ── overlays/DashedCircle.jsx ─────────────────────────────────────────────
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const DashedCircle = ({ center_x=0.5, center_y=0.5, radius=120, color, start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const startF     = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF     = frame - startF;
  const drawFrames = Math.round(fps * 0.5);
  const progress   = interpolate(localF,[0,drawFrames],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const circum     = 2 * Math.PI * radius;
  const dashColor  = color || brand?.accent || '#C9A84C';
  return (
    <AbsoluteFill style={{ pointerEvents:'none' }}>
      <svg width={width} height={height} style={{ position:'absolute', top:0, left:0 }}>
        <circle
          cx={center_x * width} cy={center_y * height} r={radius}
          fill="none" stroke={dashColor} strokeWidth={3}
          strokeDasharray="12 8"
          strokeDashoffset={circum * (1 - progress)}
          opacity={interpolate(localF,[0,6],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}
        />
      </svg>
    </AbsoluteFill>
  );
};
