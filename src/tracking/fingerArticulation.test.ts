import { describe, expect, it } from 'vitest';
import { fingerPinchHand } from '../tests/fingerPinchHand';
import { measureFingerCurls } from './fingerArticulation';

describe('free-finger landmark angles', () => {
  it('also detects a piano-style knuckle press while the finger joints remain straight', () => {
    for (const base of [9,13,17]) {
      const p=fingerPinchHand();
      for(let i=base+1;i<=base+3;i++) {
        const dy=p.world[i].y-p.world[base].y;
        p.world[i]={...p.world[i],y:p.world[base].y+dy*Math.cos(.7),z:dy*Math.sin(.7)};
      }
      expect(measureFingerCurls(p.image,720/1280,p.world)[[9,13,17].indexOf(base)]).toBeGreaterThan(.14);
    }
  });
  it.each([0,1,2])('measures finger %i independently, including little-finger splay', finger => {
    const rest=fingerPinchHand(); const bends=[0,0,0]; bends[finger]=1;
    const pressed=fingerPinchHand(bends);
    const a=measureFingerCurls(rest.image,720/1280,rest.world);
    const b=measureFingerCurls(pressed.image,720/1280,pressed.world);
    expect(b[finger]! - a[finger]!).toBeGreaterThan(.14);
    for(let i=0;i<3;i++) if(i!==finger) expect(b[i]).toBeCloseTo(a[i]!);
  });
  it('is invariant to rigid 3D rotation and scale and supports image-only fallback', () => {
    const p=fingerPinchHand([1,0,0]);
    const original=measureFingerCurls(p.image,720/1280,p.world);
    const rotated=p.world.map(j=>({x:(j.x*Math.cos(.7)+j.z*Math.sin(.7))*1.3,y:j.y*1.3,
      z:(-j.x*Math.sin(.7)+j.z*Math.cos(.7))*1.3}));
    const after=measureFingerCurls(p.image,720/1280,rotated);
    original.forEach((value,i)=>expect(after[i]).toBeCloseTo(value!));
    expect(measureFingerCurls(p.image,720/1280)[0]).toBeGreaterThan(.14);
    expect(measureFingerCurls([],720/1280)).toEqual([null,null,null]);
  });
});
