// ── SceneComposer.jsx ─────────────────────────────────────────────────────
// The master compositor. Reads the complete scene JSON and assembles
// all four layers in order: base → character → elements → text.
//
// KEY FIX: scene_start_ms
// STT timestamps from Google Speech-to-Text are absolute from the start of
// the full voiceover. Each scene clip starts at frame 0 but its words may
// start at e.g. 29,000ms into the voiceover. Without subtracting this offset,
// all caption and timed element logic compares against a currentMs that will
// never reach the absolute timestamp — so nothing ever appears.
//
// scene_start_ms = stt_timestamps[0].start_ms (first word of this scene)
// This is passed to ElementsLayer and used by all caption components.
// Every component that compares currentMs against a timestamp subtracts it.

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

  // ── scene_start_ms ────────────────────────────────────────────────────────
  // The absolute ms offset of this scene's first word in the full voiceover.
  // All caption timing and timed-element comparisons subtract this value
  // so that frame 0 of this clip maps correctly to the first word.
  const sttTimestamps  = sceneJson.stt_timestamps || [];
  const scene_start_ms = sttTimestamps.length > 0
    ? (sttTimestamps[0].start_ms || 0)
    : 0;

  // ── Transition calculations ──────────────────────────────────────────────
  const transIn       = sceneJson.transition_in  || { type: 'fade', duration_ms: 400 };
  const transOut      = sceneJson.transition_out || { type: 'fade', duration_ms: 300 };
  const transInF      = Math.round((transIn.duration_ms  / 1000) * fps);
  const transOutF     = Math.round((transOut.duration_ms / 1000) * fps);
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
  const slideOffset = getSlideOffset(
    frame, transIn, transOut, transInF, transOutStart, durationInFrames
  );

  // ── Audio ─────────────────────────────────────────────────────────────────
  const bgmTrack     = sceneJson.brand?.bgm_track;
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
      {/* ── Layer 1: Base background ─────────────────────────────────── */}
      <BaseLayer sceneJson={sceneJson} brand={brand} />

      {/* ── Layer 2: Character pose ──────────────────────────────────── */}
      <CharacterLayer sceneJson={sceneJson} brand={brand} />

      {/* ── Layer 3: Elements ────────────────────────────────────────── */}
      {/* scene_start_ms passed here so captions and timed elements     */}
      {/* can subtract the absolute offset and fire at the right frame  */}
      <ElementsLayer
        sceneJson={sceneJson}
        brand={brand}
        scene_start_ms={scene_start_ms}
      />

      {/* ── Layer 4: Text overlays ───────────────────────────────────── */}
      <TextLayer sceneJson={sceneJson} brand={brand} />

      {/* ── Audio: BGM ──────────────────────────────────────────────── */}
      {bgmTrack && (
        <Audio
          src={staticFile(`assets/bgm/${bgmTrack}.mp3`)}
          volume={0.12}
          loop
        />
      )}

      {/* ── Audio: SFX ──────────────────────────────────────────────── */}
      {/* at_ms values are relative to scene start — no offset needed   */}
      {soundEffects.map((sfx, i) => {
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
function getSlideOffset(frame, transIn, transOut, transInF, transOutStart, totalFrames) {
  const SLIDE_PX = 1408;
  let xOffset = 0;

  if (transIn.type === 'slide') {
    const dir = transIn.direction === 'from_right' ? SLIDE_PX : -SLIDE_PX;
    xOffset += interpolate(
      frame,
      [0, transInF],
      [dir, 0],
      { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

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