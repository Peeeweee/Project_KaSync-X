import { PinchPressTracker } from './pinchPressTracker';
import { PointTapTracker } from './pointTapTracker';

/** Allow two detection intervals, bounded so a genuinely lost hand still stops. */
export function handRecoveryMs(fps: number | null) {
  return fps && Number.isFinite(fps) && fps > 0 ? Math.min(250, Math.max(90, 2000 / fps)) : 90;
}

interface GestureSession {
  previousPinching: boolean;
  point: PointTapTracker;
  press: PinchPressTracker;
  expiresAt: number | null;
}

/** Retain detector state, never stale landmarks, through a brief known-hand gap. */
export class HandGestureMemory {
  private sessions = new Map<string, GestureSession>();

  reconcile(visible: Set<string>, now: number, recoveryMs: number) {
    for (const [key, session] of this.sessions) {
      if (!visible.has(key) && session.expiresAt === null) {
        session.expiresAt = now + recoveryMs;
        // Point taps require continuous motion; never infer one across a gap.
        session.point = new PointTapTracker();
      }
      if (session.expiresAt !== null &&
          (key.startsWith('hand-') || now >= session.expiresAt)) {
        this.sessions.delete(key);
      } else if (visible.has(key)) session.expiresAt = null;
    }
  }

  get(key: string) {
    let session = this.sessions.get(key);
    if (!session) {
      session = { previousPinching: false, point: new PointTapTracker(), press: new PinchPressTracker(), expiresAt: null };
      this.sessions.set(key, session);
    }
    return session;
  }

  clear() { this.sessions.clear(); }
}
