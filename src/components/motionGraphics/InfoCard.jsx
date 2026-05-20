// ── motionGraphics/InfoCard.jsx ───────────────────────────────────────────
// Dark navy card with title, optional icon path, and body text.
// Slides up and fades in at start_ms.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export const InfoCard = ({
  title='', body_text='', icon_name, accent_color,
  start_ms=0, position='center', brand
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF   = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF   = frame - startF;
  const progress = spring({ frame:localF, fps, config:{ damping:12, stiffness:80 } });
  const opacity  = interpolate(localF,[0,10],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const translateY = interpolate(progress,[0,1],[40,0]);
  const accent   = accent_color || brand?.accent || '#C9A84C';
  const navy     = brand?.primary || '#1B2A4A';

  const POSITIONS = {
    center:     { top:'50%', left:'50%', transform:`translate(-50%,-50%) translateY(${translateY}px)` },
    left:       { top:'50%', left:'5%',  transform:`translateY(calc(-50% + ${translateY}px))` },
    right:      { top:'50%', right:'5%', transform:`translateY(calc(-50% + ${translateY}px))` },
    bottom:     { bottom:'10%', left:'50%', transform:`translateX(-50%) translateY(${translateY}px)` },
  };
  const pos = POSITIONS[position] || POSITIONS.center;

  return (
    <div style={{ position:'absolute', ...pos, opacity, zIndex:8,
      backgroundColor: navy, borderRadius:12, padding:'28px 36px',
      maxWidth:520, borderLeft:`5px solid ${accent}`,
      boxShadow:'0 8px 32px rgba(0,0,0,0.4)' }}>
      {title && (
        <div style={{ color: accent, fontSize:26, fontWeight:700,
          fontFamily: brand?.font_heading||'Oswald', marginBottom:10, letterSpacing:0.5 }}>
          {title}
        </div>
      )}
      {body_text && (
        <div style={{ color:'#FFFFFF', fontSize:20, fontFamily: brand?.font_body||'Inter',
          lineHeight:1.6 }}>
          {body_text}
        </div>
      )}
    </div>
  );
};
