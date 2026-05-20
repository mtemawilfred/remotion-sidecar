// ── motionGraphics/BeforeAfter.jsx ────────────────────────────────────────
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const BeforeAfter = ({ before_label='Before', after_label='After', before_items=[], after_items=[], start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF  = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF  = frame - startF;
  const opacity = interpolate(localF,[0,12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const navy    = brand?.primary||'#1B2A4A';
  const gold    = brand?.accent ||'#C9A84C';
  const danger  = brand?.danger ||'#991B1B';
  const success = brand?.success||'#166534';
  const col = (label, items, color) => (
    <div style={{ flex:1, backgroundColor:navy, borderRadius:12, padding:'24px 28px',
      borderTop:`4px solid ${color}` }}>
      <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:26, color, marginBottom:16,
        fontWeight:700 }}>{label}</div>
      {items.map((item,i) => (
        <div key={i} style={{ fontFamily:brand?.font_body||'Inter', fontSize:20,
          color:'rgba(255,255,255,0.85)', marginBottom:8, lineHeight:1.4 }}>• {item}</div>
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{ display:'flex', alignItems:'center', justifyContent:'center',
      gap:24, padding:'0 60px', opacity }}>
      {col(before_label, before_items, danger)}
      {col(after_label,  after_items,  success)}
    </AbsoluteFill>
  );
};
