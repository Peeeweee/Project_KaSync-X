import { Profiler } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceStatus } from './PerformanceStatus';
import { CenterReadout } from './CenterReadout';
import { useHandStore, type HandData } from '../store/handState';
import { useMusicStore } from '../store/musicState';
import { useVolumeGestureStore } from '../store/volumeGesture';
import { useLiveNoteReleaseStore } from '../diagnostics/liveNoteRelease';
import { useHandRecoveryStore } from '../store/handRecovery';

const hand = (overrides: Partial<HandData> = {}): HandData => ({
  landmarks:[],handedness:'Left',screenRole:'left',isPinching:true,isKeyDown:true,
  pinchStrength:.8,pinchDistance:.1,palmPosition:{x:.25,y:.4},indexTipPosition:{x:.25,y:.3},handRotation:0,
  ...overrides,
});
const publish = (...hands: HandData[]) => act(() => useHandStore.getState().setHands(hands,hands));
beforeEach(() => {
  useHandRecoveryStore.setState({ active: false });
  useHandStore.getState().setHands([],[]);
  useMusicStore.getState().setMusicState({mode:'Chord',hoveredRoot:'C',hoveredQuality:'maj',hoveredBass:null,playingNotes:[]});
  useVolumeGestureStore.setState({owner:null,effectOwner:null});
  useLiveNoteReleaseStore.setState({lastRelease:null});
});
afterEach(cleanup);

describe('performance gesture feedback', () => {
  it('shows recovery while a cut is held or the quality hand remains visible', () => {
    render(<PerformanceStatus />);
    publish(hand({ screenRole: 'right', handedness: 'Right' }));
    act(() => useHandRecoveryStore.setState({ active: true }));
    expect(screen.getByRole('status').textContent).toContain('FINDING HAND');
    expect(useMusicStore.getState().playingNotes).toEqual([]);
    act(() => useHandRecoveryStore.setState({ active: false }));
    expect(screen.getByRole('status').textContent).not.toContain('FINDING HAND');
  });
  it('distinguishes a closed-pinch cut from a disconnected pinch and follows the cut/resume cycle', () => {
    render(<><PerformanceStatus /><CenterReadout /></>);
    publish(hand());
    expect(screen.getByRole('status').textContent).toContain('PINCH CONNECTED');
    act(() => useMusicStore.getState().setMusicState({playingNotes:['C4','E4','G4']}));
    expect(screen.getByRole('status').textContent).toContain('PLAYING');
    act(() => {
      const cut = hand({isKeyDown:false,articulatingFingers:['Middle']});
      useHandStore.getState().setHands([cut],[cut]);
      useMusicStore.getState().setMusicState({playingNotes:[]});
    });
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('CUT HELD. Lift fingers to resume');
    expect(screen.getByText('Lift fingers to resume')).toBeTruthy();
    expect(screen.queryByText('Pinch to play')).toBeNull();
    expect(screen.getByText('PINCH LINKED')).toBeTruthy();
    act(() => {
      const up = hand(); useHandStore.getState().setHands([up],[up]);
      useMusicStore.getState().setMusicState({playingNotes:['C4','E4','G4']});
    });
    expect(screen.getByRole('status').textContent).toContain('PLAYING');
  });
  it('uses the note hand, so a quality-hand cut cannot mislabel the performance', () => {
    render(<PerformanceStatus />);
    publish(hand({isPinching:false,isKeyDown:false}),hand({handedness:'Right',screenRole:'right',isKeyDown:false}));
    expect(screen.getByRole('status').textContent).toContain('HAND FOUND');
    act(() => useVolumeGestureStore.setState({owner:'Left'}));
    expect(screen.getByRole('status').textContent).toContain('VOLUME CONTROL');
  });
  it('shows recovery during the dropout guard, then hand loss, and clears it when a hand returns', () => {
    render(<PerformanceStatus />);
    act(() => useMusicStore.getState().setMusicState({playingNotes:['C4']}));
    expect(screen.getByRole('status').textContent).toContain('FINDING HAND');
    act(() => {
      useMusicStore.getState().setMusicState({playingNotes:[]});
      useLiveNoteReleaseStore.setState({lastRelease:{reason:'hand-lost',atMs:100,heldMs:90,hand:null,pinching:null,fingerCurls:null}});
    });
    expect(screen.getByRole('status').textContent).toContain('HAND LOST');
    publish(hand({isPinching:false,isKeyDown:false}));
    expect(screen.getByRole('status').textContent).toContain('HAND FOUND');
  });
  it('does not rerender for new landmarks while the semantic gesture state is unchanged', () => {
    const commits = vi.fn();
    render(<Profiler id="feedback" onRender={commits}><PerformanceStatus /></Profiler>);
    publish(hand());
    const count = commits.mock.calls.length;
    for (let i=0;i<20;i++) publish(hand({indexTipPosition:{x:.25+i*.001,y:.3}}));
    expect(commits).toHaveBeenCalledTimes(count);
  });
});
