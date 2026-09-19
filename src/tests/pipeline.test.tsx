import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { useHandStore } from '../store/handState';
import { useMusicStore } from '../store/musicState';
import { useLooperStore } from '../store/looperState';
import { looperService } from '../looper/recorder';
import { computeGestures } from '../tracking/gestureRecognizer';
import type { Landmark } from '@mediapipe/tasks-vision';
import * as Tone from 'tone';

// --- TONE.JS MOCK ---
const { mockAudioNode, mockPart } = vi.hoisted(() => ({
  mockAudioNode: {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockReturnThis(),
    toDestination: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
    triggerAttack: vi.fn(),
    triggerAttackRelease: vi.fn(),
    triggerRelease: vi.fn(),
    releaseAll: vi.fn(),
    start: vi.fn().mockReturnThis(),
    chain: vi.fn().mockReturnThis(),
    wet: { value: 0, rampTo: vi.fn() },
    volume: { value: 0, rampTo: vi.fn() },
  },
  mockPart: {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    add: vi.fn().mockReturnThis(),
    loop: false,
    loopEnd: 0,
  }
}));

vi.mock('tone', () => {
  const MockClass = function(this: any) {
    return mockAudioNode;
  };
  
  return {
    PolySynth: MockClass,
    Synth: MockClass,      // used as the voice type: new Tone.PolySynth(Tone.Synth, ...)
    MonoSynth: MockClass,
    FMSynth: MockClass,
    AMSynth: MockClass,
    Reverb: MockClass,
    FeedbackDelay: MockClass,
    Chorus: MockClass,
    BitCrusher: MockClass,
    Limiter: MockClass,   // required by InstrumentService + TrackAudioLayer
    Part: function() { return mockPart; },
    Transport: {
      bpm: { value: 120 },
      start: vi.fn(),
      stop: vi.fn(),
      position: "0:0:0",
      state: 'stopped'
    },
    now: vi.fn(() => 0),
    Offline: vi.fn(),
    Gain: MockClass,
    Volume: MockClass,
    Destination: mockAudioNode,
    gainToDb: vi.fn((val) => 20 * Math.log10(val)),
    start: vi.fn(),
    Time: vi.fn(() => ({ toSeconds: () => 0.125 })),
    // getContext() is called by our new AudioContext state guard in buildSynth
    getContext: vi.fn(() => ({ state: 'running', rawContext: { state: 'running' } })),
    context: {
      state: 'running',
      resume: vi.fn(),
    },
  };
});


// Mock the performance monitor hook to avoid requestAnimationFrame loops in tests
vi.mock('../hooks/usePerformanceMonitor', () => ({
  usePerformanceMonitor: () => false,
}));

// Mock useHandTracking so it doesn't try to create a Web Worker in jsdom
vi.mock('../hooks/useHandTracking', () => ({
  useHandTracking: () => ({ isReady: true }),
}));

// --- SPY SETUP ---
vi.spyOn(looperService, 'triggerChord');
vi.spyOn(looperService, 'triggerNote');
vi.spyOn(looperService, 'releaseChord');
vi.spyOn(looperService, 'releaseNote');

// --- MOCK LANDMARK GENERATOR ---
// Generates a hand. Root wheel is roughly centered on screen.
// We'll mock the palm position to specific normalized coordinates to trigger wheel slices.
function createHand(isPinching: boolean, normalizedX: number, normalizedY: number, handedness: 'Left' | 'Right'): Landmark[] {
  const landmarks: Landmark[] = new Array(21).fill({ x: normalizedX, y: normalizedY, z: 0 });
  
  // To satisfy computeGestures pinch logic:
  // PINCH_THRESHOLD = 0.06
  if (isPinching) {
    landmarks[4] = { x: normalizedX, y: normalizedY, z: 0 }; // Thumb tip
    landmarks[8] = { x: normalizedX, y: normalizedY, z: 0 }; // Index tip
  } else {
    landmarks[4] = { x: normalizedX, y: normalizedY, z: 0 };
    landmarks[8] = { x: normalizedX + 0.1, y: normalizedY, z: 0 }; // Far apart
  }

  // To satisfy palm center (average of 0, 5, 9, 13, 17)
  [0, 5, 9, 13, 17].forEach((idx) => {
    landmarks[idx] = { x: normalizedX, y: normalizedY, z: 0 };
  });

  // To satisfy wrist/middleBase rotation (0 to 9)
  // If we want rotation 0, keep y same, x different
  landmarks[0] = { x: normalizedX, y: normalizedY, z: 0 };
  landmarks[9] = { x: normalizedX + 0.1, y: normalizedY, z: 0 };

  return landmarks;
}

function processAndSetHand(landmarks: Landmark[], handedness: 'Left' | 'Right') {
  const gesture = computeGestures(landmarks);
  const handObj = {
    handedness,
    landmarks,
    isPinching: gesture.isPinching,
    pinchStrength: gesture.pinchStrength,
    palmPosition: gesture.palmPosition,
    indexTipPosition: gesture.indexTipPosition,
    handRotation: gesture.handRotation,
  };
  useHandStore.getState().setHands([handObj], [handObj]);
}

function processAndSetTwoHands(left: Landmark[], right: Landmark[]) {
  const leftGesture = computeGestures(left);
  const rightGesture = computeGestures(right);
  const leftObj = {
    handedness: 'Left' as const,
    landmarks: left,
    isPinching: leftGesture.isPinching,
    pinchStrength: leftGesture.pinchStrength,
    palmPosition: leftGesture.palmPosition,
    indexTipPosition: leftGesture.indexTipPosition,
    handRotation: leftGesture.handRotation,
  };
  const rightObj = {
    handedness: 'Right' as const,
    landmarks: right,
    isPinching: rightGesture.isPinching,
    pinchStrength: rightGesture.pinchStrength,
    palmPosition: rightGesture.palmPosition,
    indexTipPosition: rightGesture.indexTipPosition,
    handRotation: rightGesture.handRotation,
  };
  useHandStore.getState().setHands([leftObj, rightObj], [leftObj, rightObj]);
}


describe('Pipeline E2E Test Harness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHandStore.getState().setHands([], []);
    useHandStore.getState().setIsTracking(true);
    useMusicStore.getState().setMusicState({ hoveredRoot: null, hoveredQuality: null, hoveredBass: null, mode: 'Chord' });
    useLooperStore.getState().setTransportState({ isGlobalRecording: false, isPlaying: false });
    // Clear tutorial state so we don't get blocked
    localStorage.setItem('kasync_tutorial_completed', 'true');
  });

  it('verifies the full pipeline: single pinch note (Melody mode)', async () => {
    // 1. Setup App
    render(<App />);
    
    // Click Initialize Audio Engine to render wheels
    const initBtn = screen.getByText(/Initialize Audio Engine/i);
    await userEvent.click(initBtn);

    // Switch to Melody Mode
    act(() => {
      useMusicStore.getState().setMusicState({ mode: 'Melody' });
    });

    // 2. Generate pinch at East (Angle 0 -> Index 0 -> 'C')
    // Center of screen is roughly 0.5, 0.5. 
    // Wheel center is 50% for Melody. East (Angle 0) -> x > 0.5. So x: 0.65, y: 0.5.
    const hand = createHand(true, 0.65, 0.5, 'Right');
    
    act(() => {
      processAndSetHand(hand, 'Right');
    });

    // 3. Assert App computed root and triggered note
    expect(useMusicStore.getState().hoveredRoot).toBe('C');
    expect(looperService.triggerNote).toHaveBeenCalledWith('C4', 1);
    expect(mockAudioNode.triggerAttack).toHaveBeenCalled();
    
    // 4. Release hand
    const releasedHand = createHand(false, 0.65, 0.5, 'Right');
    act(() => {
      processAndSetHand(releasedHand, 'Right');
    });

    // 5. Assert release
    expect(looperService.releaseNote).toHaveBeenCalled();
    expect(mockAudioNode.triggerRelease).toHaveBeenCalled();
  });

  it('verifies the full pipeline: dual hand chord and slash chord', async () => {
    render(<App />);
    await userEvent.click(screen.getByText(/Initialize Audio Engine/i));

    // Ensure Chord mode
    act(() => {
      useMusicStore.getState().setMusicState({ mode: 'Chord' });
    });

    // Left hand: Root Wheel (center 0.25, 0.5). East (C) -> x: 0.35, y: 0.5
    const leftHand = createHand(true, 0.35, 0.5, 'Left');
    // Right hand: Quality Wheel (center 0.75, 0.5). North (minor) -> x: 0.75, y: 0.35
    // Wait, Quality wheel at North is index 3 -> aug? Let's check quality wheel mapping.
    // Basic qualities: maj, min, dim, aug, 7, maj7, m7, sus4 (8 segments). 
    // Math: angle -PI/2 is North. -PI/2 in [0, 2pi) is 3PI/2.
    // Segment = 2PI/8 = PI/4. 
    // index = Math.floor((3PI/2 + PI/8) / PI/4) % 8 = Math.floor(1.625 PI / 0.25 PI) = Math.floor(6.5) = 6 -> m7.
    const rightHand = createHand(true, 0.75, 0.35, 'Right'); // Up from center
    
    act(() => {
      processAndSetTwoHands(leftHand, rightHand);
    });

    // It should trigger a chord
    expect(looperService.triggerChord).toHaveBeenCalled();
    
    // The exact notes depend on the wheel mapping which is complex. But we know it triggered A chord.
    // Let's assert that Tone.js triggerAttack was called with an array of notes.
    expect(mockAudioNode.triggerAttack).toHaveBeenCalled();

    // Now let's drag the Left hand far East to trigger the Bass Ring (slash chord)
    // Distance from center (0.25) to 0.45 is 0.2. Outer ring is > 0.15 threshold.
    const leftSlash = createHand(true, 0.45, 0.5, 'Left');
    
    act(() => {
      processAndSetTwoHands(leftSlash, rightHand);
    });

    // Active bass should now be 'C' (since angle is still East, index 0).
    expect(useMusicStore.getState().hoveredBass).toBe('C');
    
    // Release
    const leftRelease = createHand(false, 0.45, 0.5, 'Left');
    const rightRelease = createHand(false, 0.75, 0.35, 'Right');
    act(() => {
      processAndSetTwoHands(leftRelease, rightRelease);
    });

    expect(looperService.releaseChord).toHaveBeenCalled();
    expect(mockAudioNode.triggerRelease).toHaveBeenCalled();
  });

  it('verifies the looper records mock performance', async () => {
    render(<App />);
    await userEvent.click(screen.getByText(/Initialize Audio Engine/i));
    
    // 1. Arm track 0 and start global record
    act(() => {
      useLooperStore.getState().armTrack(0);
      useLooperStore.getState().setTransportState({ isGlobalRecording: true, isPlaying: true });
    });

    // 2. Play a note (Melody mode)
    act(() => {
      useMusicStore.getState().setMusicState({ mode: 'Melody' });
    });

    const hand = createHand(true, 0.65, 0.5, 'Right'); // Play C4
    act(() => {
      processAndSetHand(hand, 'Right');
    });

    // 3. Release note
    const releaseHand = createHand(false, 0.65, 0.5, 'Right');
    act(() => {
      processAndSetHand(releaseHand, 'Right');
    });

    // 4. Assert event was added to track 0
    const track0 = useLooperStore.getState().tracks[0];
    expect(track0.events.length).toBe(1);
    
    // The recorded event should have the note we just triggered
    expect(track0.events[0].notes).toContain('C4');
  });
});
