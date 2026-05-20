// ── motionGraphics/SectionTitle.jsx ──────────────────────────────────────
// Full screen chapter title card. Used for section transitions.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const SectionTitle = ({ title='', subtitle='', background_color, start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF   = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF   = frame - startF;
  const opacity  = interpolate(localF,[0,12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const scale    = interpolate(localF,[0,12],[0.95,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const bg       = background_color || brand?.primary || '#1B2A4A';
  return (
    <AbsoluteFill style={{ backgroundColor:bg, display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', opacity, transform:`scale(${scale})` }}>
      <div style={{ width:60, height:4, backgroundColor:brand?.accent||'#C9A84C',
        marginBottom:24, borderRadius:2 }}/>
      <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:64, fontWeight:700,
        color:'#FFFFFF', textAlign:'center', letterSpacing:1 }}>{title}</div>
      {subtitle && (
        <div style={{ fontFamily:brand?.font_body||'Inter', fontSize:26,
          color:'rgba(255,255,255,0.7)', marginTop:16, textAlign:'center' }}>{subtitle}</div>
      )}
      <div style={{ width:60, height:4, backgroundColor:brand?.accent||'#C9A84C',
        marginTop:24, borderRadius:2 }}/>
    </AbsoluteFill>
  );
};
