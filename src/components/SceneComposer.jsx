// ── SceneComposer.jsx ─────────────────────────────────────────────────────
// The master compositor. Reads the complete scene JSON and assembles
// all four layers in order: base → character → elements → text.
// Also handles transitions in/out and places all audio.
// Every value comes from sceneJson — nothing hardcoded.

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  Audio,
  staticFile,
} from 'remotion';

import { BaseLayer }      from './layers/BaseLayer';
import { CharacterLayer } from './layers/CharacterLayer';
import { ElementsLayer }  from './layers/ElementsLayer';
import { TextLayer }      from './layers/TextLayer';
import { useBrand }       from './hooks/useBrand';

export const SceneComposer = ({ sceneJson }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const brand = useBrand(sceneJson.brand);

  // ── Transition calculations ──────────────────────────────────────────────
  const transIn      = sceneJson.transition_in  || { type: 'fade', duration_ms: 400 };
  const transOut     = sceneJson.transition_out || { type: 'fade', duration_ms: 300 };
  const transInF     = Math.round((transIn.duration_ms  / 1000) * fps);
  const transOutF    = Math.round((transOut.duration_ms / 1000) * fps);
  const transOutStart = durationInFrames - transOutF;

  // Master opacity for fade transitions
  const opacity = interpolate(
    frame,
    [0, transInF, transOutStart, durationInFrames],
    [
      transIn.type  === 'fade' ? 0 : 1,
      1,
      1,
      transOut.type === 'fade' ? 0 : 1,
    ],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Slide offset for slide transitions
  const slideOffset = getSlideOffset(frame, transIn, transOut, transInF, transOutStart, durationInFrames);

  // ── Audio: background music ──────────────────────────────────────────────
  // BGM plays under the entire scene at low volume.
  // The track name comes from brand.bgm_track.
  const bgmTrack = sceneJson.brand?.bgm_track;

  // ── Audio: sound effects ─────────────────────────────────────────────────
  // Each SFX specifies the file name and at_ms (when to start playing).
  const soundEffects = sceneJson.assets?.sound_effects || [];

  return (
    <AbsoluteFill
      style={{
        transform:  slideOffset,
        opacity,
        fontFamily: brand.font_body,
        overflow:   'hidden',
      }}
    >
      {/* ── Layer 1: Base ────────────────────────────────────────────── */}
      <BaseLayer sceneJson={sceneJson} brand={brand} />

      {/* ── Layer 2: Character ──────────────────────────────────────── */}
      <CharacterLayer sceneJson={sceneJson} brand={brand} />

      {/* ── Layer 3: Elements (overlays, motion graphics, icons) ─────── */}
      <ElementsLayer sceneJson={sceneJson} brand={brand} />

      {/* ── Layer 4: Text overlays timed to STT ─────────────────────── */}
      <TextLayer sceneJson={sceneJson} brand={brand} />

      {/* ── Audio: Background music ───────────────────────────────────── */}
      {bgmTrack && (
        <Audio
          src={staticFile(`assets/bgm/${bgmTrack}.mp3`)}
          volume={0.12}
          // Loop BGM in case the scene is longer than the track
          loop
        />
      )}

      {/* ── Audio: Sound effects ──────────────────────────────────────── */}
      {soundEffects.map((sfx, i) => {
        // Convert at_ms to frame number
        const startFrame = Math.round((sfx.at_ms / 1000) * fps);
        return (
          <Audio
            key={i}
            src={staticFile(`assets/sfx/${sfx.file}`)}
            startFrom={startFrame}
            volume={sfx.volume || 0.8}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ── Slide offset helper ────────────────────────────────────────────────────
// Returns a CSS transform string for slide transitions.
// If the transition type is not 'slide', returns no transform.
function getSlideOffset(frame, transIn, transOut, transInF, transOutStart, totalFrames) {
  const SLIDE_PX = 1408; // Full canvas width

  let xOffset = 0;

  // Slide in
  if (transIn.type === 'slide') {
    const dir = transIn.direction === 'from_right' ? SLIDE_PX : -SLIDE_PX;
    xOffset += interpolate(
      frame,
      [0, transInF],
      [dir, 0],
      { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  // Slide out
  if (transOut.type === 'slide') {
    const dir = transOut.direction === 'to_left' ? -SLIDE_PX : SLIDE_PX;
    xOffset += interpolate(
      frame,
      [transOutStart, totalFrames],
      [0, dir],
      { easing: Easing.in(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  return xOffset !== 0 ? `translateX(${xOffset}px)` : 'none';
}
