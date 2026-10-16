let cachedVideo: HTMLVideoElement | null = null;
let cachedTime = 0;
let cachedDims = {
  vw: 640,
  vh: 480,
  dw: 1024,
  dh: 768,
  renderedW: 640,
  renderedH: 480,
  offsetX: 0,
  offsetY: 0,
};

/**
 * Converts a MediaPipe landmark (0-1 in camera frame) to
 * screen-normalized coordinates (0-1 in viewport), accounting for
 * CSS object-cover cropping and the scaleX(-1) mirror flip.
 */
export function landmarkToScreen(
  landmarkX: number,
  landmarkY: number,
  videoEl: HTMLVideoElement,
  mirrored: boolean = true,
): { x: number; y: number } {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const vw = videoEl.videoWidth || 640;
  const vh = videoEl.videoHeight || 480;

  // Cache geometry for up to 60ms to avoid synchronous layout reflows across multiple landmarks per frame
  if (
    cachedVideo !== videoEl ||
    cachedDims.vw !== vw ||
    cachedDims.vh !== vh ||
    now - cachedTime > 60
  ) {
    const dw = videoEl.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024);
    const dh = videoEl.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 768);
    const scale = Math.max(dw / vw, dh / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX = (renderedW - dw) / 2;
    const offsetY = (renderedH - dh) / 2;

    cachedDims = { vw, vh, dw, dh, renderedW, renderedH, offsetX, offsetY };
    cachedVideo = videoEl;
    cachedTime = now;
  }

  const { dw, dh, renderedW, renderedH, offsetX, offsetY } = cachedDims;
  const pixelX = landmarkX * renderedW - offsetX;
  const pixelY = landmarkY * renderedH - offsetY;

  const normX = pixelX / dw;
  const normY = pixelY / dh;

  return { x: mirrored ? 1 - normX : normX, y: normY };
}
