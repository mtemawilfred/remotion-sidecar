// ── overlays/RedXStrike.jsx ───────────────────────────────────────────────
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export const RedXStrike = ({ position = 'center', size = 80, start_ms = 0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localFrame = frame - startFrame;
  const progress = spring({ frame: localFrame, fps, config: { damping: 6, stiffness: 200 } });
  const scale    = interpolate(progress, [0, 1], [0, 1]);

  const POSITIONS = {
    center:      { top: '50%', left: '50%', transform: `translate(-50%,-50%) scale(${scale})` },
    top_left:    { top: '15%', left: '10%', transform: `scale(${scale})` },
    top_right:   { top: '15%', right: '10%',transform: `scale(${scale})` },
    bottom_left: { bottom: '20%', left: '10%',transform: `scale(${scale})` },
    bottom_right:{ bottom: '20%', right:'10%',transform: `scale(${scale})` },
  };
  const pos = POSITIONS[position] || POSITIONS.center;

  return (
    <div style={{ position: 'absolute', ...pos, zIndex: 12 }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <line x1="10" y1="10" x2="90" y2="90" stroke="#991B1B" strokeWidth="14" strokeLinecap="round"/>
        <line x1="90" y1="10" x2="10" y2="90" stroke="#991B1B" strokeWidth="14" strokeLinecap="round"/>
      </svg>
    </div>
  );
};
