import type { Landmark } from '@mediapipe/tasks-vision';
import { dialDelta } from './volumeDial';

export interface OpenPalmPose { angle: number; tips: { x: number; y: number }[] }

/** Five extended fingers, independent of translation, image aspect and mirroring. */
export function openPalmPose(points: Landmark[], aspect: number, mirrored: boolean): OpenPalmPose | null {
  if (points.length < 21 || !Number.isFinite(aspect) || aspect <= 0) return null;
  if (!points.every(p => [p.x, p.y, p.z].every(Number.isFinite))) return null;
  const vector = (a: number, b: number) => ({ x: points[a].x - points[b].x,
    y: (points[a].y - points[b].y) * aspect, z: points[a].z - points[b].z });
  for (const [base, joint, tip] of [[2, 3, 4], [5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]]) {
    const a = vector(base, joint), b = vector(tip, joint);
    const length = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
    if (length < 1e-8 || (a.x * b.x + a.y * b.y + a.z * b.z) / length > -0.65) return null;
    if (points[tip].x < 0 || points[tip].x > 1 || points[tip].y < 0 || points[tip].y > 1) return null;
  }
  const palm = vector(9, 0);
  const size = Math.hypot(palm.x, palm.y);
  if (size < 0.025) return null;
  const sign = mirrored ? -1 : 1;
  return { angle: Math.atan2(palm.y, palm.x * sign), tips: [4, 8, 12, 16, 20].map(i => ({
    x: (points[i].x - points[0].x) * sign / size,
    y: (points[i].y - points[0].y) * aspect / size,
  })) };
}

export interface PalmDialSample { id: string; x: number; y: number; pose: OpenPalmPose | null }

export class OpenPalmDialTracker {
  owner: string | null = null;
  private reference: { id: string; pose: OpenPalmPose } | null = null;
  private value = 0;
  update(hands: PalmDialSample[], value: number) {
    const sample = hands.find(h => h.id === (this.owner ?? this.reference?.id) && h.pose && Math.hypot(h.x, h.y) < 1.2);
    if (!sample) { this.owner = null; this.reference = null; }
    if (sample?.pose && this.reference) {
      const delta = dialDelta(this.reference.pose.angle, sample.pose.angle);
      const c = Math.cos(delta), s = Math.sin(delta);
      const residual = sample.pose.tips.reduce((sum, p, i) => {
        const q = this.reference!.pose.tips[i];
        return sum + (p.x - (q.x * c - q.y * s)) ** 2 + (p.y - (q.x * s + q.y * c)) ** 2;
      }, 0) / 5;
      if (Math.abs(delta) > Math.PI / 3 || residual > 0.12) {
        this.reference = { id: sample.id, pose: sample.pose };
      } else if (Math.abs(delta) > (this.owner ? Math.PI / 90 : Math.PI / 22.5)) {
        if (this.owner) {
          if (Math.abs(value - this.value) > 0.015) this.value = value;
        } else { this.owner = sample.id; this.value = value; }
        this.value = Math.max(0, Math.min(1, this.value + delta / Math.PI));
        this.reference = { id: sample.id, pose: sample.pose };
      }
    } else if (!this.reference) {
      const arm = hands.find(h => h.pose && Math.hypot(h.x, h.y) < 0.95);
      if (arm?.pose) this.reference = { id: arm.id, pose: arm.pose };
    }
    return { owner: this.owner, reserved: this.reference?.id ?? null, ready: !!this.reference,
      value: this.owner ? Math.round(this.value * 100) / 100 : value };
  }
}
