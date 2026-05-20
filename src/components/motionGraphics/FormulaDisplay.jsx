// ── motionGraphics/FormulaDisplay.jsx ────────────────────────────────────
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const FormulaDisplay = ({ left='', operator='+', right='', start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF  = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF  = frame - startF;
  const opacity = interpolate(localF,[0,12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const scale   = interpolate(localF,[0,12],[0.9,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return (
    <AbsoluteFill style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:24, opacity, transform:`scale(${scale})` }}>
      {[left, operator, right].map((part, i) => (
        <div key={i} style={{ fontFamily:brand?.font_heading||'Oswald',
          fontSize: i===1 ? 56 : 42, fontWeight:700,
          color: i===1 ? brand?.accent||'#C9A84C' : '#FFFFFF',
          backgroundColor: i!==1 ? brand?.primary||'#1B2A4A' : 'transparent',
          padding: i!==1 ? '16px 28px' : '0', borderRadius: i!==1 ? 10 : 0 }}>
          {part}
        </div>
      ))}
    </AbsoluteFill>
  );
};
