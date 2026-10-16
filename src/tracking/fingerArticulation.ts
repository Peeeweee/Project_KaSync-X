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

/** A relative rest pose accommodates naturally bent fingers during a pinch. */
export class FingerArticulationTracker {
  private rest: FingerCurls = [null,null,null];
  private down = [false,false,false];
  reset(curls?: FingerCurls) {
    this.rest = curls ? [...curls] : [null,null,null];
    this.down = [false,false,false];
  }
  update(curls: FingerCurls) {
    let strikes = 0, lifts = 0;
    for (let i=0;i<3;i++) {
      const curl = curls[i];
      if (curl === null || !Number.isFinite(curl)) {
        if (!this.down[i]) this.rest[i] = null;
        continue;
      }
      const rest = this.rest[i];
      if (rest === null) { this.rest[i] = curl; continue; }
      if (this.down[i]) {
        if (curl-rest < .055) { this.down[i] = false; lifts++; }
      } else {
        this.rest[i] = Math.min(rest,curl);
        if (curl-this.rest[i]! > .14) { this.down[i] = true; strikes++; }
      }
    }
    return { strikes, lifts, fingers: this.down.map((down,i) => down ? ARTICULATION_FINGERS[i] : null)
      .filter((name): name is typeof ARTICULATION_FINGERS[number] => name !== null) };
  }
}

