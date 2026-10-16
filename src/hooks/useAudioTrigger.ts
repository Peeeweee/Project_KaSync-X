import { useEffect, useRef } from 'react';
import { isPublishingHandFrame, subscribeToHandFrames, useHandStore, type HandData } from '../store/handState';
import { useMusicStore, type EffectsState } from '../store/musicState';
import { useLooperStore } from '../store/looperState';
import { looperService } from '../looper/recorder';
import { buildChord } from '../music/chords';
import { getScreenHands } from '../tracking/handUtils';
import { useTrackingSettingsStore } from '../store/trackingSettings';

/** Live key-down/up events bypass React rendering and preserve performed durations. */
export function useAudioTrigger(audioStarted: boolean) {
  const started = useRef(audioStarted);
  useEffect(() => { started.current = audioStarted; }, [audioStarted]);
  useEffect(() => {
    let owner: string | null = null;
    let lastKey = '';
    let previousMode = useMusicStore.getState().mode;
    const previous = new Map<string, { down: boolean; id: number }>();
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFx: string | null = null;
    let fxBaseline: EffectsState | null = null;
    const identity = (h: HandData) => h.handedness === 'Unknown' ? h.screenRole ?? h.handedness : h.handedness;
    const down = (h: HandData) => h.isKeyDown ?? (h.isPinching || !!h.isPointPressed);
    const clearRelease = () => {
      if (releaseTimer !== null) clearTimeout(releaseTimer);
      releaseTimer = null;
    };
    const release = () => {
      owner = null;
      lastKey = '';
      if (previousMode === 'Melody') looperService.releaseNote(false, true);
      else looperService.releaseChord(false, true);
      useMusicStore.getState().setMusicState({ playingNotes: [] });
    };
    const restoreFx = () => {
      if (lastFx && fxBaseline) {
        const store = useLooperStore.getState();
        const track = store.tracks.find(t => t.isArmed);
        if (track) store.setTrackProperty(track.id, 'effects', fxBaseline);
      }
      lastFx = null;
      fxBaseline = null;
    };
    const trigger = (freshFrame = false) => {
      if (!started.current) return;
      const hands = useHandStore.getState().smoothedHands;
      const { leftHand, rightHand } = getScreenHands(hands);
      const music = useMusicStore.getState();
      const { mode, hoveredRoot, hoveredQuality, hoveredBass, hoveredEffect } = music;
      if (mode !== previousMode) {
        previousMode = mode;
        clearRelease();
        previous.clear();
        restoreFx();
        // Reset state before the synchronous music-store notification.
        owner = null;
        lastKey = '';
        looperService.releaseChord(false, true);
      }
      if (mode === 'Song') {
        const active = rightHand && (rightHand.isTriggerActive ?? (rightHand.isPinching || rightHand.isPointPressed));
        if (active && hoveredEffect && hoveredEffect !== lastFx) {
          const store = useLooperStore.getState();
          const track = store.tracks.find(t => t.isArmed);
          if (track) {
            if (!lastFx) fxBaseline = { ...track.effects };
            store.setTrackProperty(track.id, 'effects', {
              reverb: false, delay: false, chorus: false, bitcrusher: false, sustain: false,
              [hoveredEffect]: true,
            });
          }
          lastFx = hoveredEffect;
        } else if (!active) restoreFx();
      }
      const playingHands = mode === 'Chord' ? hands : mode === 'Song'
        ? [leftHand ?? (hands.length === 1 ? hands[0] : null)].filter((h): h is HandData => !!h)
        : [leftHand ?? rightHand ?? hands[0]].filter((h): h is HandData => !!h);
      if (owner !== null && !playingHands.some(h => identity(h) === owner)) {
        // Treat loss of the owning hand as a dropout even while a second hand
        // remains visible. Do not steal or choke the voice during this guard.
        const fps = useTrackingSettingsStore.getState().actualTrackingFps;
        const guardMs = hands.length > 0 && fps && fps > 0 ? Math.min(250, Math.max(90, 2000 / fps)) : 90;
        if (releaseTimer === null) releaseTimer = setTimeout(() => {
          releaseTimer = null;
          previous.clear();
          release();
        }, guardMs);
        return;
      }
      const fresh = playingHands.find(h => {
        const prev = previous.get(identity(h));
        return down(h) && (!prev?.down || (h.pressId ?? 0) > prev.id);
      });
      // Wheel selection may arrive after the hand event. Keep key-down pending
      // until a pitch exists, and commit before publishing playingNotes.
      for (const h of playingHands) {
        if (hoveredRoot || !down(h)) previous.set(identity(h), { down: down(h), id: h.pressId ?? 0 });
      }
      if (hands.length > 0) {
        const visible = new Set(playingHands.map(identity));
        for (const key of previous.keys()) if (!visible.has(key)) previous.delete(key);
      }
      const current = fresh ?? playingHands.find(h => identity(h) === owner);
      if (current && down(current)) {
        clearRelease();
        // Wheel gaps during a held gesture are navigation, not key-up.
        if (!hoveredRoot) {
          if (freshFrame && owner !== null) looperService.keepLiveNotesAlive();
          return;
        }
        const notes = mode === 'Melody' ? [`${hoveredRoot}4`]
          : buildChord(hoveredRoot, hoveredQuality || 'maj', hoveredBass);
        const key = notes.join(',');
        if (fresh || key !== lastKey) {
          owner = identity(current);
          lastKey = key;
          if (fresh) looperService.releaseChord(false, true);
          const velocity = current.isPinching ? current.pressVelocity ?? current.pinchStrength
            : current.pointVelocity ?? current.triggerVelocity ?? 0.8;
          if (mode === 'Melody') looperService.triggerNote(notes[0], velocity);
          else looperService.triggerChord(notes, velocity);
          music.setMusicState({ playingNotes: notes });
        } else if (freshFrame) {
          // Fresh camera detections confirm a deliberate long hold; retain the
          // watchdog only as protection against genuinely lost input.
          looperService.keepLiveNotesAlive();
        }
      } else if (owner !== null) {
        if (hands.length > 0) {
          clearRelease();
          release();
        } else if (releaseTimer === null) {
          releaseTimer = setTimeout(() => {
            releaseTimer = null;
            previous.clear();
            release();
          }, 90);
        }
      }
    };
    const unsubHands = subscribeToHandFrames(() => trigger(true));
    const unsubMusic = useMusicStore.subscribe(() => {
      if (!isPublishingHandFrame()) trigger();
    });
    return () => {
      unsubHands(); unsubMusic(); clearRelease(); restoreFx(); release();
    };
  }, []);
}
