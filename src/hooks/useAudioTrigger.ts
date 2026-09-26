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
import { useMusicStore } from '../store/musicState';
import { useLooperStore } from '../store/looperState';
import { looperService } from '../looper/recorder';
import { buildChord } from '../music/chords';

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
      }, 60); // 60ms debounce — tight enough to feel instant, loose enough to survive jitter
    };

    // ── Core trigger function — called on every hand/music state change ──
    const trigger = () => {
      if (!audioStartedRef.current) return;

      const hands = useHandStore.getState().smoothedHands;
      const music = useMusicStore.getState();
      const { mode, hoveredRoot, hoveredQuality, hoveredBass, hoveredEffect } = music;

      // ── CHORD MODE ───────────────────────────────────────────────────────────
      if (mode === 'Chord') {
        const h0 = hands[0];
        const h1 = hands[1];
        const leftPinch  = h0?.isPinching ?? false;
        const rightPinch = h1?.isPinching ?? false;

        if (leftPinch && rightPinch && hoveredRoot && hoveredQuality) {
          clearRelease();
          const notes = buildChord(hoveredRoot, hoveredQuality, hoveredBass);
          const key   = notes.join(',');
          if (key !== lastChordKey.current) {
            lastChordKey.current = key;
            looperService.triggerChord(notes, Math.max(h0!.pinchStrength, h1!.pinchStrength));
            music.setMusicState({ playingNotes: notes });
          }
        } else {
          scheduleRelease(false, hands.length === 0);
        }

      // ── SONG MODE ────────────────────────────────────────────────────────────
      } else if (mode === 'Song') {
        const hLeft  = hands[0];
        const hRight = hands[1];
        const leftPinch  = hLeft?.isPinching  ?? false;
        const rightPinch = hRight?.isPinching ?? false;

        // LEFT HAND → play chord
        if (leftPinch && hoveredRoot && hoveredQuality) {
          clearRelease();
          const notes = buildChord(hoveredRoot, hoveredQuality, hoveredBass);
          const key   = notes.join(',');
          if (key !== lastChordKey.current) {
            lastChordKey.current = key;
            looperService.triggerChord(notes, hLeft!.pinchStrength);
            music.setMusicState({ playingNotes: notes });
          }
        } else {
          scheduleRelease(false, hands.length === 0);
        }

        // RIGHT HAND → Momentary FX (active only while pinched and hovering)
        if (rightPinch && hoveredEffect) {
          if (hoveredEffect !== lastFxEffect.current) {
            const store = useLooperStore.getState();
            const armedTrack = store.tracks.find(t => t.isArmed);
            if (armedTrack) {
              // Turn ON new effect, and ensure all other FX are OFF (radio/momentary behavior)
              const newEffects = { ...armedTrack.effects };
              
              // If we dragged from a previous effect, turn it off
              if (lastFxEffect.current && lastFxEffect.current in newEffects) {
                newEffects[lastFxEffect.current as keyof typeof newEffects] = false;
              }
              
              // Turn on the current effect
              newEffects[hoveredEffect as keyof typeof newEffects] = true;

              store.setTrackProperty(armedTrack.id, 'effects', newEffects);
            }
            lastFxEffect.current = hoveredEffect;
          }
        } else {
          // Pinch released or moved off any effect — turn off the last active effect
          if (lastFxEffect.current) {
            const store = useLooperStore.getState();
            const armedTrack = store.tracks.find(t => t.isArmed);
            if (armedTrack) {
              store.setTrackProperty(armedTrack.id, 'effects', {
                ...armedTrack.effects,
                [lastFxEffect.current]: false
              });
            }
            lastFxEffect.current = null;
          }
        }

      // ── MELODY MODE ──────────────────────────────────────────────────────────
      } else {
        const h = hands[0];
        if (h?.isPinching && hoveredRoot) {
          clearRelease();
          const noteLow  = `${hoveredRoot}4`;
          const noteHigh = `${hoveredRoot}5`;
          const key = `${noteLow},${noteHigh}`;
          if (lastChordKey.current !== key) {
            lastChordKey.current = key;
            looperService.triggerChord([noteLow, noteHigh], h.pinchStrength);
            music.setMusicState({ playingNotes: [noteLow, noteHigh] });
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
