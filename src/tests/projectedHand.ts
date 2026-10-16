import type { Landmark } from '@mediapipe/tasks-vision';

export function projectedHand(depth: number, x = 0, y = 0, angle = 0) {
  const world: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, px, py, pz] of [[0, 0, 0.05, 0], [5, -0.03, -0.02, 0],
    [9, 0, -0.03, 0], [13, 0.018, -0.025, 0], [17, 0.035, -0.01, 0],
    [4, -0.03, -0.06, -0.01], [8, -0.032, -0.06, -0.01]]) {
    world[i] = { x: px * Math.cos(angle) + pz * Math.sin(angle), y: py,
      z: -px * Math.sin(angle) + pz * Math.cos(angle) };
  }
  const image = world.map(p => ({ x: 0.5 + (p.x + x) / (p.z + depth),
    y: 0.5 + (p.y + y) / (p.z + depth) * 1280 / 720, z: p.z / depth }));
  return { image, world };
}


