import type * as Tone from 'tone';

const requests = new WeakMap<Tone.Reverb, { pending: number | null }>();
/** Coalesce tail edits and serialize IR generation; never rebuild per camera frame. */
export function queueReverbDecay(reverb: Tone.Reverb, decay: number) {
  const existing = requests.get(reverb);
  if (existing) { existing.pending = decay; return; }
  if (reverb.decay === decay) return;
  const request = { pending: decay as number | null };
  requests.set(reverb, request);
  void (async () => {
    try {
      while (request.pending !== null && !reverb.disposed) {
        await reverb.ready;
        if (reverb.disposed) break;
        const next = request.pending;
        request.pending = null;
        if (next !== null && reverb.decay !== next) {
          reverb.decay = next;
          await reverb.ready;
        }
      }
    } finally { requests.delete(reverb); }
  })().catch(() => { /* Disposed/closed contexts cannot accept another tail update. */ });
}
