// ── overlays/StickerReveal.jsx ────────────────────────────────────────────
// Squash and stretch bounce-in for any small sticker/emoji-style element.
// Uses text content for now — extend with images if needed.
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
export const StickerReveal = ({ text='⚡', position='top_right', scale=1, start_ms=0, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startF   = Math.round((start_ms/1000)*fps);
  if (frame < startF) return null;
  const localF   = frame - startF;
  const progress = spring({ frame:localF, fps, config:{ damping:6, stiffness:180 } });
  const s        = interpolate(progress,[0,1],[0,scale]);
  const POSITIONS = {
    top_right:  { top:'10%', right:'6%' }, top_left: { top:'10%', left:'6%' },
    bottom_right:{ bottom:'15%', right:'6%' }, center:{ top:'50%', left:'50%', transform:'translate(-50%,-50%)' },
  };
  const pos = POSITIONS[position] || POSITIONS.top_right;
  return (
    <div style={{ position:'absolute', ...pos, transform:`${pos.transform||''} scale(${s})`,
      fontSize: 48 * scale, lineHeight:1, zIndex:9 }}>
      {text}
    </div>
  );
};
