// ── motionGraphics/StatReveal.jsx ─────────────────────────────────────────
// Large number that counts up from 0 to target value.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const StatReveal = ({ value=0, unit='', label='', start_ms=0, count_duration_ms=1200, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF   = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF   = frame - startF;
  const countF   = Math.round((count_duration_ms/1000)*fps);
  const progress = interpolate(localF,[0,countF],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const displayed = Math.round(progress * value);
  const opacity   = interpolate(localF,[0,8],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return (
    <AbsoluteFill style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', opacity }}>
      <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:120, fontWeight:700,
        color:brand?.accent||'#C9A84C', lineHeight:1 }}>
        {displayed}{unit}
      </div>
      {label && <div style={{ fontFamily:brand?.font_body||'Inter', fontSize:28,
        color:'#FFFFFF', marginTop:12 }}>{label}</div>}
    </AbsoluteFill>
  );
};
