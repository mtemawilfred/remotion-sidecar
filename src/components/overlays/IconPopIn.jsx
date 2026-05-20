// ── overlays/IconPopIn.jsx ────────────────────────────────────────────────
// A Lucide-style icon that bounces in with spring physics at a position.
// Uses inline SVG paths for common icons so no external library needed
// in the render environment. Add more icons to ICON_PATHS as needed.
//
// Props:
//   icon_name    — name matching ICON_PATHS keys below
//   position     — position key same as FloatingLabel
//   size         — icon size in px (default 64)
//   color        — icon color (default brand.accent)
//   start_ms     — when the icon pops in

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// SVG path data for each supported icon
// viewBox is 24x24 for all Lucide icons
const ICON_PATHS = {
  'trending-down':    'M22 17l-8.5-8.5-5 5L2 7',
  'trending-up':      'M22 7l-8.5 8.5-5-5L2 17',
  'x-circle':         'M15 9l-6 6M9 9l6 6M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0z',
  'check-circle':     'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0zM9 12l2 2 4-4',
  'alert-triangle':   'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  'shield':           'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'target':           'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0zM12 12m-3 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0M12 12h.01',
  'zap':              'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  'rocket':           'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z',
  'brain':            'M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.14z',
  'wallet':           'M20 12V22H4V12M22 7H2v5h20V7zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  'bar-chart':        'M12 20V10M18 20V4M6 20v-4',
  'clock':            'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0zM12 6v6l4 2',
  'dollar-sign':      'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  'arrow-up':         'M12 19V5M5 12l7-7 7 7',
  'arrow-down':       'M12 5v14M19 12l-7 7-7-7',
};

const POSITIONS = {
  top_left:      { top: '10%',    left: '5%'    },
  top_right:     { top: '10%',    right: '5%'   },
  top_center:    { top: '10%',    left: '50%',  marginLeft: '-32px' },
  bottom_left:   { bottom: '15%', left: '5%'    },
  bottom_right:  { bottom: '15%', right: '5%'   },
  bottom_center: { bottom: '15%', left: '50%',  marginLeft: '-32px' },
  center:        { top: '50%',    left: '50%',  marginLeft: '-32px', marginTop: '-32px' },
  mid_left:      { top: '50%',    left: '5%',   marginTop: '-32px'  },
  mid_right:     { top: '50%',    right: '5%',  marginTop: '-32px'  },
};

export const IconPopIn = ({
  icon_name = 'zap',
  position  = 'top_right',
  size      = 64,
  color,
  start_ms  = 0,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const iconColor  = color || brand?.accent || '#C9A84C';
  const startFrame = Math.round((start_ms / 1000) * fps);

  if (frame < startFrame) return null;

  const localFrame = frame - startFrame;
  const progress   = spring({ frame: localFrame, fps, config: { damping: 8, stiffness: 150 } });
  const scale      = interpolate(progress, [0, 1], [0, 1]);
  const opacity    = interpolate(localFrame, [0, 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const pathData = ICON_PATHS[icon_name] || ICON_PATHS['zap'];
  const pos      = POSITIONS[position]   || POSITIONS.top_right;

  return (
    <div style={{ position: 'absolute', ...pos, zIndex: 8, opacity,
      transform: `scale(${scale})`, transformOrigin: 'center' }}>
      <svg
        width={size} height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={iconColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={pathData} />
      </svg>
    </div>
  );
};
