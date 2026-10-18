import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TransportBar } from './TransportBar';
import { useLooperStore } from '../store/looperState';
import { useMusicStore } from '../store/musicState';
import { useSongStore } from '../store/songStore';

vi.mock('../looper/recorder', () => ({ looperService: { toggleRecording: vi.fn() } }));

beforeEach(() => {
  useMusicStore.setState(useMusicStore.getInitialState(), true);
  useLooperStore.setState(useLooperStore.getInitialState(), true);
  useMusicStore.getState().setMusicState({ mode: 'Chord', hoveredRoot: 'C#', hoveredQuality: 'maj', currentInstrument: 'FM' });
});
afterEach(cleanup);

it('keeps setup changes when collapsed and returns keyboard focus on Escape', () => {
  render(<TransportBar />);
  expect(screen.getByLabelText('Selected chord: C#maj')).toBeTruthy();
  expect(screen.getByText('FM Synth')).toBeTruthy();
  expect(screen.queryByLabelText('Key')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Setup' }));
  fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'F' } });
  fireEvent.click(screen.getByLabelText('Snap to scale'));
  fireEvent.keyDown(screen.getByLabelText('Key'), { key: 'Escape' });
  expect(screen.queryByRole('region', { name: 'Performance setup' })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Setup' }));
  fireEvent.click(screen.getByRole('button', { name: 'Setup' }));
  expect((screen.getByLabelText('Key') as HTMLSelectElement).value).toBe('F');
  expect(screen.getByLabelText('Snap to scale').getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByLabelText('Selected chord: D♭maj')).toBeTruthy();
});

it('shows actual enabled track effects independently of whether their panel is open', () => {
  render(<TransportBar />);
  const track = useLooperStore.getState().tracks.find(track => track.isArmed) ?? useLooperStore.getState().tracks[0];
  const initial = Object.values(track.effects).filter(Boolean).length;
  const fx = screen.getByRole('button', { name: `FX ${initial || 'Off'}` });
  fireEvent.click(fx);
  const reverb = screen.getByRole('button', { name: 'reverb' });
  const enabled = reverb.getAttribute('aria-pressed') === 'true';
  fireEvent.click(reverb);
  const count = initial + (enabled ? -1 : 1);
  fireEvent.click(screen.getByRole('button', { name: 'Close control panel' }));
  expect(screen.queryByRole('region', { name: 'Track effects' })).toBeNull();
  expect(screen.getByRole('button', { name: `FX ${count || 'Off'}` }).getAttribute('aria-expanded')).toBe('false');
  expect(useLooperStore.getState().tracks.find(t => t.id === track.id)?.effects.reverb).toBe(!enabled);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(useLooperStore.getState().isPlaying).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Stop playback' }));
  expect(useLooperStore.getState().isPlaying).toBe(false);
});

it('uses song section spelling and keeps section navigation accessible in Song mode', () => {
  const saved = useSongStore.getState();
  useSongStore.getState().replaceLibrary([{ id: 'layout-test', name: 'Layout', defaultKey: 'C', createdAt: 0, updatedAt: 0,
    sections: [{ id: 'intro', name: 'Intro', key: 'F', colorTag: '#00ffff', repeatCount: 1, chords: [{ root: 'C#', quality: 'maj' }] }],
  }], 'layout-test');
  try {
    render(<TransportBar />);
    act(() => useMusicStore.getState().setMusicState({ mode: 'Song' }));
    expect(screen.getByLabelText('Selected chord: D♭maj')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next song section' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }));
    expect(screen.queryByLabelText('Key')).toBeNull();
    expect(screen.getByLabelText('Quantize to sixteenth notes')).toBeTruthy();
  } finally { useSongStore.setState(saved, true); }
});
