// ── motionGraphics/QuoteCard.jsx ──────────────────────────────────────────
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const QuoteCard = ({ quote_text='', attribution='', start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF  = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF  = frame - startF;
  const opacity = interpolate(localF,[0,14],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const scale   = interpolate(localF,[0,14],[0.96,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const gold    = brand?.accent||'#C9A84C';
  return (
    <AbsoluteFill style={{ display:'flex', alignItems:'center', justifyContent:'center',
      padding:'0 80px', opacity, transform:`scale(${scale})` }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:80, color:gold, fontFamily:'Georgia,serif', lineHeight:0.5, marginBottom:16 }}>"</div>
        <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:34, color:'#FFFFFF',
          lineHeight:1.4, fontStyle:'italic', maxWidth:700 }}>{quote_text}</div>
        {attribution && <div style={{ fontFamily:brand?.font_body||'Inter', fontSize:20,
          color:gold, marginTop:20 }}>— {attribution}</div>}
      </div>
    </AbsoluteFill>
  );
};
