import type { Landmark } from '@mediapipe/tasks-vision';

export type FingerCurls = [number | null, number | null, number | null];
export const ARTICULATION_FINGERS = ['Middle', 'Ring', 'Little'] as const;

function validPoint(p: Landmark | undefined): p is Landmark {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** Same joint angles, with one palm-plane calculation shared by all three fingers. */
export function measureFingerCurls(image: Landmark[], aspect = 1, world?: Landmark[]): FingerCurls {
  const points = world && world.length >= 21 ? world : image;
  const yScale = points === world ? 1 : aspect;
  const result: FingerCurls = [null,null,null];
  const wrist=points[0], index=points[5], little=points[17];
  if (!validPoint(wrist) || !validPoint(index) || !validPoint(little) || !Number.isFinite(yScale)) return result;
  const ax=index.x-wrist.x, ay=(index.y-wrist.y)*yScale, az=index.z-wrist.z;
  const bx=little.x-wrist.x, by=(little.y-wrist.y)*yScale, bz=little.z-wrist.z;
  const nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
  const normalLength=Math.hypot(nx,ny,nz);
  for(let i=0;i<3;i++) {
    const base=9+i*4, mcp=points[base], pip=points[base+1], tip=points[base+3];
    if (!validPoint(mcp) || !validPoint(pip) || !validPoint(tip)) continue;
    const ux=mcp.x-pip.x, uy=(mcp.y-pip.y)*yScale, uz=mcp.z-pip.z;
    const vx=tip.x-pip.x, vy=(tip.y-pip.y)*yScale, vz=tip.z-pip.z;
    const pipLength=Math.hypot(ux,uy,uz)*Math.hypot(vx,vy,vz);
    const fx=tip.x-mcp.x, fy=(tip.y-mcp.y)*yScale, fz=tip.z-mcp.z;
    const length=normalLength*Math.hypot(fx,fy,fz);
    if (pipLength<1e-8 || length<1e-8 || !Number.isFinite(length)) continue;
    const pipBend=Math.PI-Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy+uz*vz)/pipLength)));
    const knuckleBend=Math.asin(Math.min(1,Math.abs(nx*fx+ny*fy+nz*fz)/length));
    result[i]=Math.max(pipBend,knuckleBend)/Math.PI;
  }
  return result;
}

// Require a deliberate initial bend; subsequent down/up strokes share the same
// travel so returning to a just-released position always plays again.
const PRESS_TRAVEL = .14;
const LIFT_TRAVEL = .085;

/** Follow each finger's stroke so a lift can rearm at a naturally bent rest pose. */
export class FingerArticulationTracker {
  private rest: FingerCurls = [null,null,null];
  private peak: FingerCurls = [null,null,null];
  private previousHeld: FingerCurls = [null,null,null];
  private down = [false,false,false];
  private rearmed = [false,false,false];
  reset(curls?: FingerCurls) {
    this.rest = curls ? [...curls] : [null,null,null];
    this.peak = [null,null,null];
    this.previousHeld = [null,null,null];
    this.down = [false,false,false];
    this.rearmed = [false,false,false];
  }
  update(curls: FingerCurls) {
    let strikes = 0, lifts = 0;
    for (let i=0;i<3;i++) {
      const curl = curls[i];
      if (curl === null || !Number.isFinite(curl)) {
        this.previousHeld[i] = null;
        if (!this.down[i]) {
          this.rest[i] = null;
        }
        continue;
      }
      const rest = this.rest[i];
      if (rest === null) { this.rest[i] = curl; continue; }
      if (this.down[i]) {
        // A deeper held position needs two agreeing observations. One high
        // estimate must not make the normal held pose look like a release.
        // Initial attacks and lifts from the established peak remain immediate.
        const confirmed = Math.min(this.previousHeld[i] ?? this.peak[i] ?? curl,curl);
        const peak = Math.max(this.peak[i] ?? curl,confirmed);
        this.previousHeld[i] = curl;
        this.peak[i] = peak;
        if (peak-curl >= LIFT_TRAVEL) {
          this.down[i] = false;
          // The next press starts from this lift, not an old, fully straight pose.
          this.rest[i] = curl;
          this.peak[i] = null;
          this.previousHeld[i] = null;
          this.rearmed[i] = true;
          lifts++;
        }
      } else {
        this.rest[i] = Math.min(rest,curl);
        const travel = this.rearmed[i] ? LIFT_TRAVEL : PRESS_TRAVEL;
        if (curl-this.rest[i]! >= travel) {
          this.down[i] = true;
          this.peak[i] = curl;
          this.previousHeld[i] = curl;
          strikes++;
        }
      }
    }
    return { strikes, lifts, fingers: this.down.map((down,i) => down ? ARTICULATION_FINGERS[i] : null)
      .filter((name): name is typeof ARTICULATION_FINGERS[number] => name !== null) };
  }
}

