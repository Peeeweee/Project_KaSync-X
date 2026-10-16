import type { Landmark } from '@mediapipe/tasks-vision';

export interface HandPressPose {
  x: number;
  y: number;
  depth: number;
  palmSize: number;
  normal: [number, number, number];
  forward: [number, number, number];
  fitError: number;
}

const PALM = [0, 5, 9, 13, 17];

/** Approximate camera-relative translation, not a calibrated depth sensor.
 * World landmarks supply hand orientation/shape; fit one translation to all
 * palm projections rather than treating apparent hand size as a key press.
 */
export function estimateHandPressPose(image: Landmark[], world: Landmark[] | undefined,
  width: number, height: number): HandPressPose | null {
  if (!world || image.length < 21 || world.length < 21 || width <= 0 || height <= 0) return null;
  let su = 0, sv = 0, s2 = 0, bx = 0, by = 0, bz = 0;
  for (const i of PALM) {
    const p = world[i], q = image[i];
    if (![p.x, p.y, p.z, q.x, q.y].every(Number.isFinite)) return null;
    const u = q.x - 0.5, v = (q.y - 0.5) * height / width;
    const a = u * p.z - p.x, b = v * p.z - p.y;
    su += u; sv += v; s2 += u * u + v * v;
    bx += a; by += b; bz -= u * a + v * b;
  }
  const n = PALM.length;
  const denominator = s2 - (su * su + sv * sv) / n;
  if (!Number.isFinite(denominator) || denominator < 1e-8) return null;
  const depth = (bz + (su * bx + sv * by) / n) / denominator;
  const x = (bx + su * depth) / n, y = (by + sv * depth) / n;
  if (!Number.isFinite(depth) || depth < 0.05 || depth > 5) return null;
  let error = 0, size2 = 0;
  for (const i of PALM) {
    const p = world[i], q = image[i];
    const z = p.z + depth;
    if (z <= 0) return null;
    error += ((p.x + x) / z - (q.x - 0.5)) ** 2 +
      ((p.y + y) / z - (q.y - 0.5) * height / width) ** 2;
    if (i !== 0) size2 += (p.x - world[0].x) ** 2 + (p.y - world[0].y) ** 2 + (p.z - world[0].z) ** 2;
  }
  const palmSize = Math.sqrt(size2 / (n - 1));
  const fitError = Math.sqrt(error / denominator);
  if (palmSize < 0.01 || !Number.isFinite(fitError) || fitError > 0.15) return null;
  const a = world[5], b = world[17], wrist = world[0], middle = world[9];
  const ax = a.x - b.x, ay = a.y - b.y, az = a.z - b.z;
  const fx = middle.x - wrist.x, fy = middle.y - wrist.y, fz = middle.z - wrist.z;
  const nx = ay * fz - az * fy, ny = az * fx - ax * fz, nz = ax * fy - ay * fx;
  const length = Math.hypot(nx, ny, nz);
  const forwardLength = Math.hypot(fx, fy, fz);
  if (length < 1e-6 || forwardLength < 1e-6) return null;
  return { x, y, depth, palmSize, normal: [nx / length, ny / length, nz / length],
    forward: [fx / forwardLength, fy / forwardLength, fz / forwardLength], fitError };
}
