import { describe, expect, it } from 'vitest';
import { PinchPressTracker } from './pinchPressTracker';
import { measureFingerCurls, type FingerCurls } from './fingerArticulation';
import { fingerPinchHand } from '../tests/fingerPinchHand';
const pinch = (fingerCurls: FingerCurls = [0,0,0]) => ({isPinching:true,pinchStrength:.8,fingerCurls});

describe('pinch and three free fingers', () => {
  it.each([0,1,2])('plays seven bend/lift notes with finger %i while pinched', finger => {
    const tracker=new PinchPressTracker(); tracker.update(pinch());
    for(let id=2;id<=8;id++) {
      const curls:FingerCurls=[0,0,0]; curls[finger]=.4;
      expect(tracker.update(pinch(curls))).toMatchObject({isKeyDown:true,pressId:id,articulationReason:'finger-press'});
      expect(tracker.update(pinch(curls))).toMatchObject({isKeyDown:true,pressId:id});
      expect(tracker.update(pinch())).toMatchObject({isKeyDown:false,pressId:id,articulationReason:'finger-lift'});
    }
  });
  it('holds until the last bent finger lifts, combining simultaneous presses into one hit', () => {
    const tracker=new PinchPressTracker();tracker.update(pinch());
    expect(tracker.update(pinch([.4,.4,0])).pressId).toBe(2);
    expect(tracker.update(pinch([0,.4,0])).isKeyDown).toBe(true);
    expect(tracker.update(pinch()).isKeyDown).toBe(false);
  });
  it('captures a relaxed starting pose, ignores jitter, and does not strike on reacquiring missing joints', () => {
    const tracker=new PinchPressTracker();tracker.update(pinch([.3,.3,.3]));
    for(const curl of [.32,.28,.31]) expect(tracker.update(pinch([curl,curl,curl])).pressId).toBe(1);
    tracker.update(pinch([null,null,null]));
    expect(tracker.update(pinch([.7,.7,.7]))).toMatchObject({isKeyDown:true,pressId:1});
    expect(tracker.update({...pinch(),isPinching:false})).toMatchObject({isKeyDown:false});
    expect(tracker.update(pinch()).pressId).toBe(2);
  });
  it('does not invent articulations during camera approach, translation or wrist rotation', () => {
    const tracker=new PinchPressTracker();
    for(const [depth,x,y,roll] of [[.6,0,0,0],[.5,.1,.03,.5],[.7,-.1,.05,-.6],[.55,0,-.1,1]]) {
      const p=fingerPinchHand([0,0,0],depth,x,y,roll);
      expect(tracker.update(pinch(measureFingerCurls(p.image,720/1280,p.world)))).toMatchObject({isKeyDown:true,pressId:1});
    }
  });
  it('preserves ordinary pinch release and re-strike without finger data', () => {
    const tracker=new PinchPressTracker();const rest={isPinching:true,pinchStrength:.8};
    tracker.update(rest); expect(tracker.update(rest).pressId).toBe(1);
    expect(tracker.update({...rest,isPinching:false}).isKeyDown).toBe(false);
    expect(tracker.update(rest).pressId).toBe(2);
  });
});
