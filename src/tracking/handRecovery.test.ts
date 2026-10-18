import { expect, it } from 'vitest';
import { HandGestureMemory, handRecoveryMs } from './handRecovery';

it('bounds recovery to two detection intervals with a safe default', () => {
  expect([null, 0, NaN, 60, 20, 10, 8, 1].map(handRecoveryMs)).toEqual([90, 90, 90, 90, 100, 200, 250, 250]);
});

it('retains a known hand’s held cut and resumes only when its finger lifts', () => {
  const memory = new HandGestureMemory();
  const session = memory.get('Left');
  session.previousPinching = true;
  const pinch = (curl: number) => ({ isPinching: true, pinchStrength: .8, fingerCurls: [curl, .2, .2] as [number, number, number] });
  session.press.update(pinch(.2));
  expect(session.press.update(pinch(.5))).toMatchObject({ isKeyDown: false, pressId: 1 });
  memory.reconcile(new Set(), 100, 250);
  // Changing measured cadence cannot move an already established deadline.
  memory.reconcile(new Set(['Left']), 300, 90);
  expect(memory.get('Left')).toBe(session);
  expect(session.previousPinching).toBe(true);
  expect(session.press.update(pinch(.5))).toMatchObject({ isKeyDown: false, pressId: 1 });
  expect(session.press.update(pinch(.4))).toMatchObject({ isKeyDown: true, pressId: 2, articulationReason: 'finger-lift' });
});

it('expires state before processing a late return, even if no extra empty frames arrived', () => {
  const memory = new HandGestureMemory();
  const before = memory.get('Left');
  memory.reconcile(new Set(), 100, 250);
  memory.reconcile(new Set(['Left']), 350, 250);
  expect(memory.get('Left')).not.toBe(before);
  expect(memory.get('Left').previousPinching).toBe(false);
});

it('never carries unknown identities or point-motion history across a gap and clears on restart', () => {
  const memory = new HandGestureMemory();
  const known = memory.get('Left');
  const unknown = memory.get('hand-0');
  const point = known.point;
  memory.reconcile(new Set(), 0, 250);
  expect(known.point).not.toBe(point);
  expect(memory.get('hand-0')).not.toBe(unknown);
  expect(memory.get('Right')).not.toBe(known);
  memory.clear();
  expect(memory.get('Left')).not.toBe(known);
});
