// ── overlays/HighlightRegion.jsx ──────────────────────────────────────────
// Animated dashed outline pulsing around a rectangular region.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const HighlightRegion = ({ x=0.1, y=0.1, width:w=0.3, height:h=0.2, color, start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps, width:cw, height:ch } = useVideoConfig();
  const startF  = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF  = frame - startF;
  const opacity = interpolate(localF,[0,8],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const pulse   = 0.5 + 0.5 * Math.sin((localF / (fps * 1)) * Math.PI * 2);
  const c       = color || brand?.accent || '#C9A84C';
  const rx      = x * cw, ry = y * ch, rw = w * cw, rh = h * ch;
  return (
    <AbsoluteFill style={{ pointerEvents:'none' }}>
      <svg width={cw} height={ch} style={{ position:'absolute', top:0, left:0 }}>
        <rect x={rx} y={ry} width={rw} height={rh}
          fill="none" stroke={c} strokeWidth={3}
          strokeDasharray="10 6" opacity={opacity * (0.6 + pulse * 0.4)}
          rx={6}/>
      </svg>
    </AbsoluteFill>
  );
};
