/**
 * useAudioTrigger — direct Zustand-subscription based audio trigger.
 *
 * PERFORMANCE: Subscribes directly to hand/music stores, bypassing React's
 * render cycle entirely. This eliminates the ~16ms frame delay that the old
 * useEffect approach added between gesture detection and audio playback.
 *
 * FX BUG FIX: Tracks the last toggled effect by NAME (not just a boolean),
 * so sliding between effects while pinching correctly fires each new zone
 * exactly once, instead of stacking.
 */
import { useEffect, useRef } from 'react';
import { useHandStore } from '../store/handState';
import { useMusicStore, type EffectsState } from '../store/musicState';
import { useLooperStore } from '../store/looperState';
import { looperService } from '../looper/recorder';
import { buildChord } from '../music/chords';
import { getScreenHands } from '../tracking/handUtils';

export function useAudioTrigger(audioStarted: boolean) {
  // Keep audioStarted in a ref so the subscription closure always reads current value
  const audioStartedRef = useRef(audioStarted);
  useEffect(() => {
    audioStartedRef.current = audioStarted;
  }, [audioStarted]);

  useEffect(() => {
    // ── State tracking (plain objects, not React state — no re-renders) ──
    const lastChordKey  = { current: '' };
    const releaseTimer  = { current: null as ReturnType<typeof setTimeout> | null };
    const lastFxEffect  = { current: null as string | null }; // tracks last effect zone pinched

    const clearRelease = () => {
      if (releaseTimer.current) {
        clearTimeout(releaseTimer.current);
        releaseTimer.current = null;
      }
    };

    const scheduleRelease = (isMelody: boolean, noHands: boolean) => {
      if (lastChordKey.current === '' || releaseTimer.current) return;
      releaseTimer.current = setTimeout(() => {
        lastChordKey.current = '';
        if (isMelody) {
          looperService.releaseNote(noHands);
        } else {
          looperService.releaseChord(noHands);
        }
        useMusicStore.getState().setMusicState({ playingNotes: [] });
        releaseTimer.current = null;
      }, 150); // 150ms debounce — prevents machine-gun rapid re-triggering if camera drops a tracking frame
    };

    // ── Core trigger function — called on every hand/music state change ──
    const trigger = () => {
      if (!audioStartedRef.current) return;

      const hands = useHandStore.getState().smoothedHands;
      const { leftHand, rightHand } = getScreenHands(hands);
      const music = useMusicStore.getState();
      const { mode, hoveredRoot, hoveredQuality, hoveredBass, hoveredEffect } = music;

      // ── CHORD MODE ───────────────────────────────────────────────────────────
      if (mode === 'Chord') {
        const leftPinch  = leftHand?.isPinching ?? false;
        const rightPinch = rightHand?.isPinching ?? false;

        // Either hand pinching (or both) triggers the chord!
        if ((leftPinch || rightPinch) && hoveredRoot) {
          clearRelease();
          const quality = hoveredQuality || 'maj';
          const notes = buildChord(hoveredRoot, quality, hoveredBass);
          const key   = notes.join(',');
          if (key !== lastChordKey.current) {
            lastChordKey.current = key;
            const pinchVal = Math.max(leftHand?.pinchStrength ?? 0.8, rightHand?.pinchStrength ?? 0.8);
            looperService.triggerChord(notes, pinchVal);
            music.setMusicState({ playingNotes: notes });
          }
        } else {
          scheduleRelease(false, hands.length === 0);
        }

      // ── SONG MODE ────────────────────────────────────────────────────────────
      } else if (mode === 'Song') {
        const leftPinch  = leftHand?.isPinching  ?? false;
        const rightPinch = rightHand?.isPinching ?? false;

        // LEFT HAND → play chord
        if (leftPinch && hoveredRoot) {
          clearRelease();
          const quality = hoveredQuality || 'maj';
          const notes = buildChord(hoveredRoot, quality, hoveredBass);
          const key   = notes.join(',');
          if (key !== lastChordKey.current) {
            lastChordKey.current = key;
            looperService.triggerChord(notes, leftHand?.pinchStrength ?? 0.8);
            music.setMusicState({ playingNotes: notes });
          }
        } else {
          scheduleRelease(false, hands.length === 0);
        }

        // RIGHT HAND → Momentary FX (strictly non-stacking radio behavior)
        if (rightPinch && hoveredEffect) {
          if (hoveredEffect !== lastFxEffect.current) {
            const store = useLooperStore.getState();
            const armedTrack = store.tracks.find(t => t.isArmed);
            if (armedTrack) {
              // Guaranteed mutual exclusivity: only the active effect is true
              const newEffects: EffectsState = {
                reverb: false,
                delay: false,
                chorus: false,
                bitcrusher: false,
                sustain: false,
                [hoveredEffect]: true,
              };
              store.setTrackProperty(armedTrack.id, 'effects', newEffects);
            }
            lastFxEffect.current = hoveredEffect;
          }
        } else if (!rightPinch && lastFxEffect.current) {
          // Pinch released — turn off all effects cleanly
          const store = useLooperStore.getState();
          const armedTrack = store.tracks.find(t => t.isArmed);
          if (armedTrack) {
            const allOff: EffectsState = {
              reverb: false,
              delay: false,
              chorus: false,
              bitcrusher: false,
              sustain: false,
            };
            store.setTrackProperty(armedTrack.id, 'effects', allOff);
          }
          lastFxEffect.current = null;
        }

      // ── MELODY MODE ──────────────────────────────────────────────────────────
      } else {
        const h = leftHand ?? rightHand ?? hands[0];
        if (h?.isPinching && hoveredRoot) {
          clearRelease();
          const noteLow  = `${hoveredRoot}4`;
          const noteHigh = `${hoveredRoot}5`;
          const key = `${noteLow},${noteHigh}`;
          if (lastChordKey.current !== key) {
            lastChordKey.current = key;
            looperService.triggerNote(noteLow, h?.pinchStrength ?? 0.8);
            music.setMusicState({ playingNotes: [noteLow] });
          }
        } else {
          scheduleRelease(true, hands.length === 0);
        }
      }
    };

    // Subscribe directly to both stores — no React render cycle overhead
    const unsubHands = useHandStore.subscribe(trigger);
    const unsubMusic = useMusicStore.subscribe(trigger);

    return () => {
      unsubHands();
      unsubMusic();
      clearRelease();
    };
  }, []); // Empty deps — refs handle all mutable state, subscriptions self-manage
}
