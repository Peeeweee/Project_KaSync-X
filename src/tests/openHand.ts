import type { Landmark } from '@mediapipe/tasks-vision';

export function openHand(angle = 0, aspect = 1, scale = 1, x = 0.5, y = 0.5): Landmark[] {
  const coordinates = [[0,.12],[-.045,.07],[-.075,.035],[-.1,.005],[-.125,-.025],
    [-.05,0],[-.05,-.05],[-.05,-.08],[-.05,-.11],[0,-.01],[0,-.07],[0,-.1],[0,-.14],
    [.045,0],[.045,-.055],[.045,-.08],[.045,-.12],[.08,.025],[.09,-.02],[.097,-.04],[.105,-.075]];
  return coordinates.map(([px,py]) => ({ x: x + (px * Math.cos(angle) - py * Math.sin(angle)) * scale,
    y: y + (px * Math.sin(angle) + py * Math.cos(angle)) * scale / aspect, z: 0 }));
}
