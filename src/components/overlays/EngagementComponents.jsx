// ── overlays/EngagementComponents.jsx ────────────────────────────────────
// Hook and engagement components for high-impact scenes.
// These are standalone AbsoluteFill components registered in ElementsLayer.

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from 'remotion';

// ── ImpactLabel ───────────────────────────────────────────────────────────
// Large stacked text slides from an edge — "FALSE BREAKOUT" style.
// Each line can have its own color. Fast cubic easing — not spring, not fade.
// Exactly the technique from the reference video.
//
// Props:
//   lines       — [{ text, color }] — e.g. [{text:'FALSE',color:'#991B1B'},{text:'BREAKOUT',color:'#FFFFFF'}]
//   direction   — 'from_left' | 'from_right' | 'from_top' | 'from_bottom'
//   start_ms    — when it slides in
//   font_size   — default 72
//   position    — 'left' | 'center' | 'right'
export const ImpactLabel = ({
  lines      = [{ text: 'IMPACT', color: '#FFFFFF' }],
  direction  = 'from_left',
  start_ms   = 0,
  font_size  = 72,
  position   = 'left',
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localF   = frame - startFrame;
  const slideF   = Math.round(fps * 0.25); // fast — 0.25 seconds

  const progress = interpolate(localF, [0, slideF], [0, 1], {
    easing:          Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight:'clamp',
  });

  // Starting offset based on direction
  const OFFSET = 400;
  let translateX = 0;
  let translateY = 0;
  if (direction === 'from_left')   translateX = OFFSET * (1 - progress) * -1;
  if (direction === 'from_right')  translateX = OFFSET * (1 - progress);
  if (direction === 'from_top')    translateY = OFFSET * (1 - progress) * -1;
  if (direction === 'from_bottom') translateY = OFFSET * (1 - progress);

  const align = position === 'center' ? 'center'
    : position === 'right' ? 'flex-end' : 'flex-start';
  const padding = position === 'center' ? '0' : '0 32px';

  return (
    <AbsoluteFill
      style={{
        display:       'flex',
        flexDirection: 'column',
        justifyContent:'center',
        alignItems:    align,
        padding,
        transform:     `translateX(${translateX}px) translateY(${translateY}px)`,
        pointerEvents: 'none',
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily:    brand?.font_heading || 'Oswald',
            fontSize:      font_size,
            fontWeight:    700,
            color:         line.color || '#FFFFFF',
            lineHeight:    1.1,
            textTransform: 'uppercase',
            textShadow:    '0 3px 16px rgba(0,0,0,0.8)',
            letterSpacing: 2,
          }}
        >
          {line.text}
        </div>
      ))}
    </AbsoluteFill>
  );
};

// ── NewsTickerHook ────────────────────────────────────────────────────────
// Breaking news ticker that sweeps in from left with bold text.
export const NewsTickerHook = ({
  text     = 'TRADERS ARE LOSING BECAUSE OF THIS',
  start_ms = 0,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF   = frame - startFrame;
  const sweepF   = Math.round(fps * 0.5);
  const progress = interpolate(localF, [0, sweepF], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });
  const fade = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const navy = brand?.primary || '#1B2A4A';
  const gold = brand?.accent  || '#C9A84C';

  return (
    <AbsoluteFill style={{ pointerEvents:'none' }}>
      <div style={{
        position:  'absolute',
        top:       height * 0.1,
        left:      0,
        width:     `${progress * 100}%`,
        overflow:  'hidden',
        backgroundColor: navy,
        borderLeft: `6px solid ${gold}`,
        padding:   '12px 24px',
      }}>
        <div style={{
          fontFamily:    brand?.font_heading || 'Oswald',
          fontSize:      28,
          fontWeight:    700,
          color:         '#FFFFFF',
          textTransform: 'uppercase',
          letterSpacing: 1,
          opacity:       fade,
          whiteSpace:    'nowrap',
        }}>
          🔴 BREAKING: {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── ProductCard ───────────────────────────────────────────────────────────
// Dark card with inner image, title, description, CTA — from reference video.
export const ProductCard = ({
  title       = '',
  subtitle    = '',
  description = '',
  cta_text    = 'See Details →',
  image_b64,
  start_ms    = 0,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;
  const { spring, interpolate: interp } = require('remotion');
  const progress = spring({ frame: localF, fps, config: { damping: 14, stiffness: 80 } });
  const scale    = interp(progress, [0, 1], [0.85, 1]);
  const opacity  = interp(localF, [0, 10], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const navy = brand?.primary || '#1B2A4A';
  const gold = brand?.accent  || '#C9A84C';

  return (
    <AbsoluteFill style={{
      display:'flex', alignItems:'center', justifyContent:'center',
      pointerEvents:'none',
    }}>
      <div style={{
        backgroundColor: navy,
        borderRadius:    16,
        padding:         '20px',
        maxWidth:        420,
        width:           '70%',
        boxShadow:       '0 12px 40px rgba(0,0,0,0.6)',
        transform:       `scale(${scale})`,
        opacity,
      }}>
        {image_b64 && (
          <img
            src={`data:image/png;base64,${image_b64}`}
            style={{ width:'100%', borderRadius:8, marginBottom:12 }}
            alt="product"
          />
        )}
        <div style={{ fontFamily:brand?.font_heading||'Oswald', fontSize:22, fontWeight:700,
          color:'#FFFFFF', marginBottom:4 }}>{title}</div>
        {subtitle && (
          <div style={{ fontFamily:brand?.font_body||'Inter', fontSize:13,
            color:'rgba(255,255,255,0.5)', marginBottom:8 }}>{subtitle}</div>
        )}
        {description && (
          <div style={{ fontFamily:brand?.font_body||'Inter', fontSize:14,
            color:'rgba(255,255,255,0.75)', lineHeight:1.5, marginBottom:12 }}>{description}</div>
        )}
        <div style={{ fontFamily:brand?.font_body||'Inter', fontSize:14,
          color:gold, fontWeight:600 }}>{cta_text}</div>
      </div>
    </AbsoluteFill>
  );
};
