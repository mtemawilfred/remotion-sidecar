// ── video/motion.js ───────────────────────────────────────────────────────
// PRIMITIVE motion math for the v3 single-timeline path. The sidecar is the dumb
// executor: it knows NOTHING about editorial names like "slide_in_left". Workflow B
// already resolved each entrance/idle into concrete params (from/to, durationFrames,
// spring/easing). These helpers just run Remotion interpolate/spring on those values.
import { interpolate, spring } from 'remotion';

const EASINGS = {
  linear:         (t) => t,
  easeOutCubic:   (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutQuart:   (t) => 1 - Math.pow(1 - t, 4),
};
// Always returns a real function (interpolate throws if given a non-function easing).
export function easingFn(name) {
  const f = EASINGS[name];
  return typeof f === 'function' ? f : EASINGS.easeOutCubic;
}

// Entrance -> a transform delta { scale, x, y, opacity, rotation, clip } at localFrame
// (localFrame = currentFrame - layer.frameStart). Pure params from B; no vocabulary here.
export function resolveEntrance(entrance, localFrame, fps) {
  const base = { scale: 1, x: 0, y: 0, opacity: 1, rotation: 0, clip: null };
  if (!entrance || entrance.kind === 'none') return base;
  const dur = Math.max(1, entrance.durationFrames || 12);

  // spring 0->1 progress (used by spring-kind entrances); overshoot via low damping
  const sp = spring({
    frame: localFrame, fps,
    config: { damping: entrance.overshoot ? 9 : 14, stiffness: 120, mass: 0.8 },
    durationInFrames: dur,
  });
  // tween 0->1 progress with easing
  const tw = interpolate(localFrame, [0, dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingFn(entrance.easing),
  });

  const out = { ...base };
  if (entrance.opacityRamp) out.opacity = interpolate(localFrame, [0, dur * 0.6], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  switch (entrance.kind) {
    case 'spring': {                              // scale-based (pop_in, scale_in, stamp, stamp_in)
      const from = entrance.from != null ? entrance.from : 0;
      const to   = entrance.to   != null ? entrance.to   : 1;
      out.scale = from + (to - from) * sp;
      if (entrance.from === 0 && !entrance.opacityRamp) out.opacity = interpolate(localFrame,[0,dur*0.4],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
      break;
    }
    case 'tween': {                               // offset-based (slide_in_left/right, rise, slide_up)
      if (entrance.prop === 'x') out.x = (entrance.fromOffset || 0) * (1 - tw);
      else if (entrance.prop === 'y') out.y = (entrance.fromOffset || 0) * (1 - tw);
      break;
    }
    case 'draw_path': {                           // graphs/charts: left->right wipe reveal
      const p = interpolate(localFrame, [0, dur], [0, 100], { extrapolateLeft:'clamp', extrapolateRight:'clamp', easing: easingFn('easeOutQuart') });
      out.clip = `inset(0 ${100 - p}% 0 0)`;      // reveal from the left edge
      break;
    }
    default: break;
  }
  return out;
}

// Idle -> a continuous offset { x, y, scale, rotation, glow } at currentFrame.
// Tiny, always-on "nothing is ever fully static". Pure sine on B's amp/period.
export function resolveIdle(idle, frame) {
  const off = { x: 0, y: 0, scale: 0, rotation: 0, glow: 0 };
  if (!idle || !idle.periodFrames) return off;
  const s = Math.sin((2 * Math.PI * frame) / idle.periodFrames);
  const a = idle.amp || 0;
  switch (idle.prop) {
    case 'y':        off.y = a * s; break;
    case 'xy':       off.x = a * s; off.y = a * Math.cos((2*Math.PI*frame)/idle.periodFrames); break;
    case 'scale':    off.scale = a * s; break;
    case 'rotation': off.rotation = a * s; break;
    case 'glow':     off.glow = Math.max(0, a * (0.5 + 0.5 * s)); break;
    default: break;
  }
  return off;
}

// Camera track -> { scale, x } at currentFrame (continuous; reaction delay; momentum easing).
export function resolveCamera(track, frame) {
  if (!Array.isArray(track) || !track.length) return { scale: 1, x: 0 };
  const seg = track.find(s => frame >= s.frameStart && frame < s.frameEnd) || track[track.length - 1];
  const delay = seg.reactionDelayFrames || 0;
  const start = seg.frameStart + delay;
  const t = interpolate(frame, [start, seg.frameEnd], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingFn(seg.easing || 'easeInOutCubic'),
  });
  const fromS = (seg.from && seg.from.scale != null) ? seg.from.scale : 1;
  const toS   = (seg.to   && seg.to.scale   != null) ? seg.to.scale   : fromS;
  const fromX = (seg.from && seg.from.x != null) ? seg.from.x : 0;
  const toX   = (seg.to   && seg.to.x   != null) ? seg.to.x   : fromX;
  // micro-drift so a 'hold' camera never fully dies
  const micro = (seg.microDrift || 0) * Math.sin((2 * Math.PI * frame) / 180);
  return { scale: fromS + (toS - fromS) * t, x: fromX + (toX - fromX) * t + micro };
}
