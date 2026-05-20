// ── motionGraphics/ComparisonRow.jsx ─────────────────────────────────────
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const ComparisonRow = ({ left_item='', right_item='', connector_type='vs', start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF  = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF  = frame - startF;
  const opacity = interpolate(localF,[0,12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const lx = interpolate(localF,[0,14],[-200,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const rx = interpolate(localF,[0,14],[200,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const navy  = brand?.primary||'#1B2A4A';
  const gold  = brand?.accent ||'#C9A84C';
  return (
    <AbsoluteFill style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:40, opacity }}>
      <div style={{ backgroundColor:navy, borderRadius:12, padding:'24px 32px',
        transform:`translateX(${lx}px)`, maxWidth:340,
        fontFamily:brand?.font_heading||'Oswald', fontSize:28, color:'#FFFFFF',
        textAlign:'center', borderTop:`4px solid ${brand?.danger||'#991B1B'}` }}>
        {left_item}
      </div>
      <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:36,
        color:gold, fontWeight:700 }}>{connector_type.toUpperCase()}</div>
      <div style={{ backgroundColor:navy, borderRadius:12, padding:'24px 32px',
        transform:`translateX(${rx}px)`, maxWidth:340,
        fontFamily:brand?.font_heading||'Oswald', fontSize:28, color:'#FFFFFF',
        textAlign:'center', borderTop:`4px solid ${brand?.success||'#166534'}` }}>
        {right_item}
      </div>
    </AbsoluteFill>
  );
};
