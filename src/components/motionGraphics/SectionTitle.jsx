// ── motionGraphics/SectionTitle.jsx ──────────────────────────────────────
// Full screen chapter title card. Used for section transitions.
//
// ADDED: 'overlay' mode + 'keyword' accent.
//   mode='overlay'  → NO full-screen background; title sits in the top third
//                     so it floats over the character/scene (RedPill narrator look).
//   keyword='WORD'  → that one word inside the title is colored with brand.accent.
// When mode is omitted/!= 'overlay', the original full-screen card is unchanged.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

// Render the title; if a keyword is supplied, color just that word with the accent.
function renderTitle(title, keyword, accent) {
  if (!keyword) return title;
  const parts = String(title).split(new RegExp(`(${keyword})`, 'i'));
  return parts.map((p, i) =>
    p.toLowerCase() === String(keyword).toLowerCase()
      ? <span key={i} style={{ color: accent }}>{p}</span>
      : <span key={i}>{p}</span>
  );
}

export const SectionTitle = ({ title='', subtitle='', keyword='', mode, background_color, start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF   = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF   = frame - startF;
  const opacity  = interpolate(localF,[0,12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const accent   = brand?.accent || '#C9A84C';

  // ── overlay mode — top-third, transparent, keyword accented ───────────────
  if (mode === 'overlay') {
    const yShift = interpolate(localF,[0,12],[16,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
    return (
      <AbsoluteFill style={{ display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'flex-start', paddingTop:'14%',
        opacity, pointerEvents:'none' }}>
        <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:58, fontWeight:800,
          color:'#FFFFFF', textAlign:'center', letterSpacing:1, lineHeight:1.1,
          padding:'0 48px', transform:`translateY(${yShift}px)`,
          textShadow:'0 2px 14px rgba(0,0,0,0.85)' }}>
          {renderTitle(title, keyword, accent)}
        </div>
      </AbsoluteFill>
    );
  }

  // ── default — full-screen chapter card (unchanged behavior) ───────────────
  const scale    = interpolate(localF,[0,12],[0.95,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const bg       = background_color || brand?.primary || '#1B2A4A';
  return (
    <AbsoluteFill style={{ backgroundColor:bg, display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', opacity, transform:`scale(${scale})` }}>
      <div style={{ width:60, height:4, backgroundColor:accent,
        marginBottom:24, borderRadius:2 }}/>
      <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:64, fontWeight:700,
        color:'#FFFFFF', textAlign:'center', letterSpacing:1 }}>{renderTitle(title, keyword, accent)}</div>
      {subtitle && (
        <div style={{ fontFamily:brand?.font_body||'Inter', fontSize:26,
          color:'rgba(255,255,255,0.7)', marginTop:16, textAlign:'center' }}>{subtitle}</div>
      )}
      <div style={{ width:60, height:4, backgroundColor:accent,
        marginTop:24, borderRadius:2 }}/>
    </AbsoluteFill>
  );
};