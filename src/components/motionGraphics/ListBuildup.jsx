// ── motionGraphics/ListBuildup.jsx ────────────────────────────────────────
// Bullet points appearing one by one at specified interval.
// Each item can be a plain string OR an object { text, icon, color }.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export const ListBuildup = ({ items=[], interval_ms=600, start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF    = Math.round((start_ms/1000)*fps);
  const intervalF = Math.round((interval_ms/1000)*fps);
  if (frame < startF) return null;
  const localF       = frame - startF;
  const visibleCount = Math.floor(localF / intervalF) + 1;

  return (
    <AbsoluteFill style={{ display:'flex', flexDirection:'column', justifyContent:'center',
      padding:'0 80px', gap:16 }}>
      {items.slice(0, visibleCount).map((item, i) => {
        const itemStartF = i * intervalF;
        const itemLocalF = localF - itemStartF;
        const opacity    = interpolate(itemLocalF,[0,8],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
        const translateX = interpolate(itemLocalF,[0,12],[-30,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});

        // item can be a plain string or an object { text, icon, color }
        const label = typeof item === 'string' ? item : (item?.text || '');
        const icon  = typeof item === 'object' ? (item?.icon || null) : null;
        const color = typeof item === 'object' ? (item?.color || brand?.accent || '#C9A84C') : (brand?.accent || '#C9A84C');

        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:16, opacity,
            transform:`translateX(${translateX}px)` }}>
            {/* Bullet dot — uses item color if provided, otherwise brand accent */}
            <div style={{ width:10, height:10, borderRadius:'50%',
              backgroundColor: color, flexShrink:0 }}/>
            {/* Optional emoji icon */}
            {icon && (
              <span style={{ fontSize:24, lineHeight:1 }}>{icon}</span>
            )}
            {/* Item text — uses item color if provided */}
            <span style={{ fontFamily:brand?.font_body||'Inter', fontSize:26,
              color: color, lineHeight:1.4 }}>{label}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
