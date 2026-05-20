// ── motionGraphics/ListBuildup.jsx ────────────────────────────────────────
// Bullet points appearing one by one at specified interval.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
export const ListBuildup = ({ items=[], interval_ms=600, start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF    = Math.round((start_ms/1000)*fps);
  const intervalF = Math.round((interval_ms/1000)*fps);
  if (frame < startF) return null;
  const localF    = frame - startF;
  const visibleCount = Math.floor(localF / intervalF) + 1;
  return (
    <AbsoluteFill style={{ display:'flex', flexDirection:'column', justifyContent:'center',
      padding:'0 80px', gap:16 }}>
      {items.slice(0, visibleCount).map((item, i) => {
        const itemStartF = i * intervalF;
        const itemLocalF = localF - itemStartF;
        const opacity    = interpolate(itemLocalF,[0,8],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
        const translateX = interpolate(itemLocalF,[0,12],[-30,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:16, opacity,
            transform:`translateX(${translateX}px)` }}>
            <div style={{ width:10, height:10, borderRadius:'50%',
              backgroundColor:brand?.accent||'#C9A84C', flexShrink:0 }}/>
            <span style={{ fontFamily:brand?.font_body||'Inter', fontSize:26,
              color:'#FFFFFF', lineHeight:1.4 }}>{item}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
