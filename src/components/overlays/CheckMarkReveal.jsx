// ── overlays/CheckMarkReveal.jsx ──────────────────────────────────────────
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export const CheckMarkReveal = ({ position = 'center', size = 80, start_ms = 0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame  = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localFrame  = frame - startFrame;
  const drawFrames  = Math.round(fps * 0.4);
  const progress    = interpolate(localFrame, [0, drawFrames], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const pathLength  = 120;
  const drawn       = progress * pathLength;

  const POSITIONS = {
    center:      { top:'50%', left:'50%', transform:'translate(-50%,-50%)' },
    top_right:   { top:'12%', right:'8%' },
    bottom_right:{ bottom:'18%', right:'8%' },
    top_left:    { top:'12%', left:'8%' },
    bottom_left: { bottom:'18%', left:'8%' },
  };
  const pos = POSITIONS[position] || POSITIONS.center;

  return (
    <div style={{ position:'absolute', ...pos, zIndex:12 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="45" stroke="#166534" strokeWidth="6"
          opacity={interpolate(localFrame,[0,8],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/>
        <path d="M25 50 L42 67 L75 35"
          stroke="#166534" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={pathLength} strokeDashoffset={pathLength - drawn}/>
      </svg>
    </div>
  );
};
