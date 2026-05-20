// ── motionGraphics/PipCounter.jsx ─────────────────────────────────────────
// Animated pip/trade counter counting up to target value.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const PipCounter = ({ target_value=0, label='pips', start_ms=0, count_duration_ms=2000, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF   = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF   = frame - startF;
  const countF   = Math.round((count_duration_ms/1000)*fps);
  const progress = interpolate(localF,[0,countF],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const displayed = Math.round(progress * target_value);
  const opacity   = interpolate(localF,[0,8],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const gold      = brand?.accent||'#C9A84C';
  return (
    <AbsoluteFill style={{ display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', opacity }}>
      <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:110, fontWeight:700,
        color:gold, lineHeight:1 }}>
        +{displayed}
      </div>
      <div style={{ fontFamily:brand?.font_body||'Inter', fontSize:32, color:'#FFFFFF',
        marginTop:8, letterSpacing:2, textTransform:'uppercase' }}>{label}</div>
    </AbsoluteFill>
  );
};
