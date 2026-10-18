import { useEffect, useRef } from 'react';
import { isPublishingHandFrame, subscribeToHandFrames, useHandStore, type HandData } from '../store/handState';
import { useMusicStore, type EffectsState, type InstrumentMode } from '../store/musicState';
import { useLooperStore } from '../store/looperState';
import { looperService } from '../looper/recorder';
import { buildChord } from '../music/chords';
import { getScreenHands } from '../tracking/handUtils';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { isVolumeHand } from '../store/volumeGesture';
import { recordNoteRelease, type NoteReleaseReason } from '../diagnostics/liveNoteRelease';
import { handRecoveryMs } from '../tracking/handRecovery';
import { useHandRecoveryStore } from '../store/handRecovery';

/** Live key-down/up events bypass React rendering and preserve performed durations. */
export function useAudioTrigger(audioStarted: boolean) {
  const started = useRef(audioStarted);
  useEffect(() => { started.current = audioStarted; }, [audioStarted]);
  useEffect(() => {
    let owner: string | null = null;
    let ownerSource: 'pinch' | 'point' | 'key' | null = null;
    let attackAt = 0;
    let lastKey = '';
    let lastSelection = '';
    let previousMode = useMusicStore.getState().mode;
    let latchedPitch: { hand: string; mode: InstrumentMode; root: string; quality: string; bass: string | null } | null = null;
    const previous = new Map<string, { down: boolean; id: number }>();
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFx: string | null = null;
    let fxBaseline: EffectsState | null = null;
    const identity = (h: HandData) => h.handedness === 'Unknown' ? h.screenRole ?? h.handedness : h.handedness;
    const down = (h: HandData) => h.isKeyDown ?? (h.isPinching || !!h.isPointPressed);
    const resumePitch = (h: HandData, mode: InstrumentMode) => h.isPinching && h.articulationReason === 'finger-lift'
      && latchedPitch?.hand === identity(h) && latchedPitch.mode === mode ? latchedPitch : null;
    const clearRelease = () => {
      if (releaseTimer !== null) clearTimeout(releaseTimer);
      releaseTimer = null;
      if (useHandRecoveryStore.getState().active) useHandRecoveryStore.setState({ active: false });
    };
    const release = (reason: NoteReleaseReason, hand?: HandData) => {
      if (owner !== null) recordNoteRelease(reason, Math.max(0,performance.now()-attackAt),hand);
      if (reason !== 'finger-press') latchedPitch = null;
      owner = null;
      ownerSource = null;
      lastKey = '';
      lastSelection = '';
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
      const allHands = useHandStore.getState().smoothedHands;
      if (owner !== null && allHands.some(h => identity(h) === owner && isVolumeHand(h))) {
        clearRelease();
        previous.clear();
        release('control-hand',allHands.find(h => identity(h) === owner));
      }
      const hands = allHands.filter(h => !isVolumeHand(h));
      const { leftHand, rightHand } = getScreenHands(allHands);
      const music = useMusicStore.getState();
      const { mode, hoveredRoot, hoveredQuality, hoveredBass, hoveredEffect } = music;
      if (mode !== previousMode) {
        latchedPitch = null;
        if (owner !== null) recordNoteRelease('mode-change',Math.max(0,performance.now()-attackAt));
        previousMode = mode;
        clearRelease();
        previous.clear();
        restoreFx();
        // Reset state before the synchronous music-store notification.
        owner = null;
        ownerSource = null;
        lastKey = '';
        lastSelection = '';
        looperService.releaseChord(false, true);
      }
      if (mode === 'Song' && !(rightHand && isVolumeHand(rightHand))) {
        const active = rightHand && !isVolumeHand(rightHand) && (rightHand.isTriggerActive ?? (rightHand.isPinching || rightHand.isPointPressed));
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
      const playingHands = mode === 'Chord' || mode === 'Song'
        ? [leftHand ?? (allHands.length === 1 ? allHands[0] : null)].filter((h): h is HandData => !!h && !isVolumeHand(h))
        : [leftHand ?? rightHand ?? allHands[0]].filter((h): h is HandData => !!h && !isVolumeHand(h));
      if (latchedPitch) {
        const visible = allHands.find(h => identity(h) === latchedPitch!.hand);
        if (visible && (!visible.isPinching || isVolumeHand(visible))) {
          latchedPitch = null;
          if (owner === null) clearRelease();
        }
      }
      if (owner !== null && !playingHands.some(h => identity(h) === owner) &&
          hands.some(h => identity(h) === owner) && playingHands.length > 0) {
        // A lone hand can play either wheel. Once a second hand establishes a
        // note/quality pair, articulation belongs to the note hand immediately.
        owner = identity(playingHands[0]);
      }
      const recoveryOwner = owner ?? latchedPitch?.hand;
      if (recoveryOwner != null && !playingHands.some(h => identity(h) === recoveryOwner)) {
        // Treat loss of the owning hand as a dropout even while a second hand
        // remains visible. Do not steal or choke the voice during this guard.
        if (releaseTimer === null) {
          useHandRecoveryStore.setState({ active: true });
          releaseTimer = setTimeout(() => {
            releaseTimer = null;
            useHandRecoveryStore.setState({ active: false });
            previous.clear();
            release('hand-lost');
          }, handRecoveryMs(useTrackingSettingsStore.getState().actualTrackingFps));
        }
        return;
      }
      // A visible hand has priority: an open pinch or a cut stops immediately.
      if (playingHands.length > 0) clearRelease();
      const fresh = playingHands.find(h => {
        const prev = previous.get(identity(h));
        const id = h.pressId ?? 0;
        // Local detector IDs restart after tracking loss. Do not discard an
        // explicit upward resume merely because its new ID is smaller.
        return down(h) && (!prev?.down || id > prev.id ||
          (h.articulationReason === 'finger-lift' && id !== prev.id));
      });
      // Wheel selection may arrive after the hand event. Keep key-down pending
      // until a pitch exists, and commit before publishing playingNotes.
      for (const h of playingHands) {
        if (hoveredRoot || resumePitch(h,mode) || !down(h)) previous.set(identity(h), { down: down(h), id: h.pressId ?? 0 });
      }
      if (hands.length > 0) {
        const visible = new Set(playingHands.map(identity));
        for (const key of previous.keys()) if (!visible.has(key)) previous.delete(key);
      }
      const current = fresh ?? playingHands.find(h => identity(h) === owner);
      // A different detector cannot keep a released pinch sounding. The source
      // which attacked the voice owns its release until the next explicit press.
      const source = fresh ? current?.isPinching ? 'pinch' : current?.isPointPressed ? 'point' : 'key' : ownerSource;
      const held = current && down(current) && (source !== 'pinch' || current.isPinching) &&
        (source !== 'point' || !!current.isPointPressed);
      if (current && held) {
        clearRelease();
        const cached = !hoveredRoot ? resumePitch(current,mode) : null;
        const root = hoveredRoot ?? cached?.root;
        const quality = cached?.quality ?? (hoveredQuality || 'maj');
        const bass = cached ? cached.bass : hoveredBass;
        // Wheel gaps during a held gesture are navigation, not key-up.
        if (!root) {
          if (freshFrame && owner !== null) looperService.keepLiveNotesAlive();
          return;
        }
        const selection = mode === 'Melody' ? `Melody:${root}`
          : `${mode}:${root}:${quality}:${bass || ''}`;
        if (!fresh && owner !== null && lastKey && selection === lastSelection) {
          if (freshFrame) looperService.keepLiveNotesAlive();
          return;
        }
        const notes = mode === 'Melody' ? [`${root}4`]
          : buildChord(root, quality, bass);
        const key = notes.join(',');
        lastSelection = selection;
        if (fresh || key !== lastKey) {
          owner = identity(current);
          ownerSource = source;
          latchedPitch = current.isPinching ? {hand:identity(current),mode,root,quality,bass} : null;
          attackAt = performance.now();
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
        clearRelease();
        const reason = current && source === 'pinch' && !current.isPinching ? 'pinch-open'
          : current?.articulationReason === 'finger-press' ? 'finger-press'
          : source === 'point' ? 'point-lift' : 'key-up';
        release(reason,current);
      }
    };
    const unsubHands = subscribeToHandFrames(() => trigger(true));
    const unsubMusic = useMusicStore.subscribe(() => {
      if (!isPublishingHandFrame()) trigger();
    });
    return () => {
      unsubHands(); unsubMusic(); clearRelease(); restoreFx(); release('cleanup');
    };
  }, []);
}
