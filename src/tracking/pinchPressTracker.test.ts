import { describe, expect, it } from 'vitest';
import { PinchPressTracker } from './pinchPressTracker';
import { measureFingerCurls, type FingerCurls } from './fingerArticulation';
import { fingerPinchHand } from '../tests/fingerPinchHand';
const pinch = (fingerCurls: FingerCurls = [0,0,0]) => ({isPinching:true,pinchStrength:.8,fingerCurls});

describe('closed-pinch cut and resume', () => {
  it.each([0,1,2])('cuts while finger %i is down and resumes on every return up', finger => {
    for (const lift of [.2,.32,.405]) {
      const tracker = new PinchPressTracker();
      const sample = (curl: number) => {
        const curls: FingerCurls = [.2,.2,.2]; curls[finger] = curl;
        return tracker.update(pinch(curls));
      };
      expect(sample(.2)).toMatchObject({isKeyDown:true,pressId:1});
      for (let id=2;id<=9;id++) {
        expect(sample(.5)).toMatchObject({isKeyDown:false,pressId:id-1,articulationReason:'finger-press'});
        for (let frame=0;frame<20;frame++) expect(sample(.5)).toMatchObject({isKeyDown:false,pressId:id-1});
        expect(sample(lift)).toMatchObject({isKeyDown:true,pressId:id,articulationReason:'finger-lift'});
        for (let frame=0;frame<20;frame++) expect(sample(lift)).toMatchObject({isKeyDown:true,pressId:id});
      }
      expect(tracker.update({...pinch(),isPinching:false}).isKeyDown).toBe(false);
    }
  });
  it('uses symmetric repeat travel and retains rearming through unavailable joints', () => {
    const tracker = new PinchPressTracker();
    const sample = (curl: number | null) => tracker.update(pinch([curl,.2,.2]));
    sample(.2);
    expect(sample(.5)).toMatchObject({isKeyDown:false,pressId:1});
    expect(sample(.415)).toMatchObject({isKeyDown:true,pressId:2});
    expect(sample(.5)).toMatchObject({isKeyDown:false,pressId:2});
    expect(sample(.405)).toMatchObject({isKeyDown:true,pressId:3});
    sample(null);
    expect(sample(.405)).toMatchObject({isKeyDown:true,pressId:3});
    expect(sample(.5)).toMatchObject({isKeyDown:false,pressId:3});
  });
  it('does not mistake a single high estimate for an intentional return up', () => {
    const tracker = new PinchPressTracker();
    const sample = (curl: number) => tracker.update(pinch([curl,.2,.2]));
    sample(.2);
    sample(.5);
    for (const curl of [.51,.5,.67,.5,.52,.49]) expect(sample(curl)).toMatchObject({isKeyDown:false,pressId:1});
    expect(sample(.39)).toMatchObject({isKeyDown:true,pressId:2});
    expect(sample(.5)).toMatchObject({isKeyDown:false,pressId:2});
  });
  it('stays muted until the last pressed finger lifts, without duplicate resumes', () => {
    const tracker = new PinchPressTracker();
    tracker.update(pinch());
    expect(tracker.update(pinch([.4,.4,0]))).toMatchObject({isKeyDown:false,pressId:1});
    expect(tracker.update(pinch([0,.4,0]))).toMatchObject({isKeyDown:false,pressId:1});
    expect(tracker.update(pinch([0,.4,.4]))).toMatchObject({isKeyDown:false,pressId:1});
    expect(tracker.update(pinch([0,0,.4]))).toMatchObject({isKeyDown:false,pressId:1});
    expect(tracker.update(pinch())).toMatchObject({isKeyDown:true,pressId:2});
    expect(tracker.update(pinch())).toMatchObject({isKeyDown:true,pressId:2});
  });
  it('allows a confirmed deeper hold to lift without fully straight fingers', () => {
    const tracker = new PinchPressTracker();
    tracker.update(pinch([.2,.2,.2]));
    tracker.update(pinch([.5,.5,.2]));
    for (const curl of [.52,.49,.53,.51,.7,.68]) expect(tracker.update(pinch([curl,curl,.2]))).toMatchObject({isKeyDown:false,pressId:1});
    expect(tracker.update(pinch([.55,.68,.2]))).toMatchObject({isKeyDown:false,pressId:1});
    expect(tracker.update(pinch([.55,.55,.2]))).toMatchObject({isKeyDown:true,pressId:2});
  });
  it('ignores starting-pose jitter and missing joints, but always stops on pinch opening', () => {
    const tracker = new PinchPressTracker();
    tracker.update(pinch([.3,.3,.3]));
    for (const curl of [.32,.28,.31]) expect(tracker.update(pinch([curl,curl,curl]))).toMatchObject({isKeyDown:true,pressId:1});
    tracker.update(pinch([null,null,null]));
    expect(tracker.update(pinch([.7,.7,.7]))).toMatchObject({isKeyDown:true,pressId:1});
    expect(tracker.update(pinch([.9,.7,.7]))).toMatchObject({isKeyDown:false,pressId:1});
    expect(tracker.update(pinch([null,.7,.7]))).toMatchObject({isKeyDown:false,pressId:1});
    expect(tracker.update(pinch([.7,.7,.7]))).toMatchObject({isKeyDown:true,pressId:2});
    expect(tracker.update({...pinch(),isPinching:false}).isKeyDown).toBe(false);
    expect(tracker.update(pinch())).toMatchObject({isKeyDown:true,pressId:3});
  });
  it('does not articulate from camera approach, translation or wrist rotation', () => {
    const tracker = new PinchPressTracker();
    for (const [depth,x,y,roll] of [[.6,0,0,0],[.5,.1,.03,.5],[.7,-.1,.05,-.6],[.55,0,-.1,1]]) {
      const p = fingerPinchHand([0,0,0],depth,x,y,roll);
      expect(tracker.update(pinch(measureFingerCurls(p.image,720/1280,p.world)))).toMatchObject({isKeyDown:true,pressId:1});
    }
  });
  it('preserves ordinary pinch opening and closing without finger data', () => {
    const tracker = new PinchPressTracker();
    const rest = {isPinching:true,pinchStrength:.8};
    tracker.update(rest);
    expect(tracker.update(rest)).toMatchObject({isKeyDown:true,pressId:1});
    expect(tracker.update({...rest,isPinching:false}).isKeyDown).toBe(false);
    expect(tracker.update(rest)).toMatchObject({isKeyDown:true,pressId:2});
  });
});
