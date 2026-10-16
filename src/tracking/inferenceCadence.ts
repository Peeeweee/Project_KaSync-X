/** Deadline pacing avoids rounding a 24 FPS budget down to 15 on a 30 FPS camera. */
export class InferenceCadence {
  private next = -Infinity;
  private interval = 0;
  due(now: number, fps: number) {
    const interval = 1000 / fps;
    if (interval !== this.interval) { this.interval = interval; this.next = -Infinity; }
    return now + 0.5 >= this.next;
  }
  started(now: number) {
    // Skip overdue slots rather than building a backlog after a stall.
    this.next = this.next === -Infinity || now - this.next >= this.interval
      ? now + this.interval : this.next + this.interval;
  }
}
