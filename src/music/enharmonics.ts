const ENHARMONIC_MAP: Record<string, string> = {
  'C#': 'D♭',
  'D#': 'E♭',
  'F#': 'G♭',
  'G#': 'A♭',
  'A#': 'B♭',
};

export function resolveEnharmonic(note: string, currentKey: string): string {
  if (!note) return '';
  const isOctave = /\d$/.test(note);
  const baseNote = isOctave ? note.slice(0, -1) : note;
  const octave = isOctave ? note.slice(-1) : '';

  // Internal sharp representations of flat keys: F, Bb, Eb, Ab, Db, Gb
  const flatKeys = ['F', 'A#', 'D#', 'G#', 'C#', 'F#'];

  if (flatKeys.includes(currentKey) && ENHARMONIC_MAP[baseNote]) {
    return ENHARMONIC_MAP[baseNote] + octave;
  }

  return baseNote + octave;
}

export function formatChordName(
  root: string,
  quality: string,
  bass: string | null,
  currentKey: string
): string {
  const rootStr = resolveEnharmonic(root, currentKey);
  let name = `${rootStr}${quality}`;
  if (bass && bass !== root) {
    const bassStr = resolveEnharmonic(bass, currentKey);
    name += `/${bassStr}`;
  }
  return name;
}
