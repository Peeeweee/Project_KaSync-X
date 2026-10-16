import { describe, expect, it } from 'vitest';
import { openHand } from '../tests/openHand';
import { openPalmPose, OpenPalmDialTracker } from './openPalmDial';

const sample = (angle = 0) => ({ id: 'Left', x: 0, y: 0, pose: openPalmPose(openHand(angle), 1, false) });
describe('five-finger wrist dial', () => {
  it('requires five extended visible fingers, rejecting pinches, curls and bad landmarks', () => {
    expect(sample().pose).not.toBeNull();
    for (const [tip, base] of [[4,2], [8,5], [12,9], [16,13], [20,17]]) {
      const points = openHand(); points[tip] = { ...points[base] };
      expect(openPalmPose(points, 1, false)).toBeNull();
    }
    const bad = openHand(); bad[8].x = NaN;
    expect(openPalmPose(bad, 1, true)).toBeNull();
  });
  it('reserves the open hand immediately but changes volume only on wrist rotation', () => {
    const tracker = new OpenPalmDialTracker();
    expect(tracker.update([sample()], .5)).toMatchObject({ owner: null, reserved: 'Left', ready: true, value: .5 });
    expect(tracker.update([sample(.03)], .5).value).toBe(.5);
    expect(tracker.update([sample(Math.PI / 4)], .5)).toMatchObject({ owner: 'Left', value: .75 });
    expect(tracker.update([sample(0)], .75).value).toBe(.5);
    expect(tracker.update([], .5)).toMatchObject({ owner: null, reserved: null, value: .5 });
  });
  it('ignores palm translation, camera approach and tracking jumps', () => {
    const tracker = new OpenPalmDialTracker(); tracker.update([sample()], .5);
    for (const scale of [.6,1.2,1]) {
      const pose = openPalmPose(openHand(0,.5625,scale,.6,.45),.5625,false);
      expect(tracker.update([{...sample(), x:.4, y:.3, pose}],.5).value).toBe(.5);
    }
    expect(tracker.update([sample(Math.PI / 2)],.5).value).toBe(.5);
  });
  it('wraps angles, respects mirroring and keeps the other hand independent', () => {
    const a = openPalmPose(openHand(0),1,true)!;
    const b = openPalmPose(openHand(-.2),1,true)!;
    const tracker = new OpenPalmDialTracker();
    tracker.update([{...sample(), pose:a}],.5);
    expect(tracker.update([{...sample(),pose:b}, {...sample(-.5),id:'Right'}],.5).value).toBe(.56);
    expect(tracker.update([{...sample(),pose:null}],.56).owner).toBeNull();
  });
});
