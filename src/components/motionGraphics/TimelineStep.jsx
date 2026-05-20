// ── motionGraphics/TimelineStep.jsx ───────────────────────────────────────
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const TimelineStep = ({ step_number=1, title='', description='', start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF  = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF  = frame - startF;
  const opacity = interpolate(localF,[0,10],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const tx      = interpolate(localF,[0,14],[-60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const gold    = brand?.accent||'#C9A84C';
  const navy    = brand?.primary||'#1B2A4A';
  return (
    <AbsoluteFill style={{ display:'flex', alignItems:'center', justifyContent:'center', opacity }}>
      <div style={{ display:'flex', alignItems:'center', gap:28, transform:`translateX(${tx}px)`,
        maxWidth:700 }}>
        <div style={{ width:72, height:72, borderRadius:'50%', backgroundColor:gold,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          fontFamily:brand?.font_heading||'Oswald', fontSize:32, fontWeight:700, color:navy }}>
          {step_number}
        </div>
        <div>
          <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:32, fontWeight:700,
            color:'#FFFFFF', marginBottom:8 }}>{title}</div>
          {description && <div style={{ fontFamily:brand?.font_body||'Inter', fontSize:20,
            color:'rgba(255,255,255,0.75)', lineHeight:1.5 }}>{description}</div>}
        </div>
      </div>
    </AbsoluteFill>
  );
};
