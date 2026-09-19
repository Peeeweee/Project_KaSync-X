export const CHROMATIC_NOTES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

export const SCALES: Record<string, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  PentatonicMajor: [0, 2, 4, 7, 9],
  PentatonicMinor: [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
};

export function getActiveNoteIndex(
  angle: number,
  snapToScale: boolean = true,
  scaleName: string = 'Major',
  rootIndex: number = 0
): number {
  // Normalize angle to [0, 2pi)
  // angle 0 is pointing right (East).
  let normalizedAngle = angle;
  if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;

  // 12 segments, each is 2*PI / 12 = PI/6
  const segmentAngle = Math.PI / 6;

  // Offset by half a segment so the boundary is between segments, not center
  const index =
    Math.floor((normalizedAngle + segmentAngle / 2) / segmentAngle) % 12;

  if (!snapToScale) return index;

  const scalePattern = SCALES[scaleName] || SCALES['Major'];
  // Create absolute indices for the scale
  const scaleIndices = scalePattern.map(
    (interval) => (rootIndex + interval) % 12
  );

  if (scaleIndices.includes(index)) {
    return index;
  }

  // Snap to nearest note in scale
  let closestIndex = scaleIndices[0];
  let minDistance = 12;

  scaleIndices.forEach((validIndex) => {
    // Distance in a circle
    let dist = Math.abs(validIndex - index);
    if (dist > 6) dist = 12 - dist;

    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = validIndex;
    }
  });

  return closestIndex;
}

// Convert index to note + octave for Tone.js (e.g. C4)
export function getTonejsNote(index: number, baseOctave: number = 4): string {
  return `${CHROMATIC_NOTES[index]}${baseOctave}`;
}
