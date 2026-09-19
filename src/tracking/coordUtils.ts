/**
 * Converts a MediaPipe landmark (0-1 in camera frame) to
 * screen-normalized coordinates (0-1 in viewport), accounting for
 * CSS object-cover cropping and the scaleX(-1) mirror flip.
 */
export function landmarkToScreen(
  landmarkX: number,
  landmarkY: number,
  videoEl: HTMLVideoElement
): { x: number; y: number } {
  const vw = videoEl.videoWidth || 640;
  const vh = videoEl.videoHeight || 480;
  const dw = videoEl.clientWidth || window.innerWidth;
  const dh = videoEl.clientHeight || window.innerHeight;

  // object-cover scale: fill the display, crop what overflows
  const scale = Math.max(dw / vw, dh / vh);

  // Rendered size of the video frame (may be larger than display)
  const renderedW = vw * scale;
  const renderedH = vh * scale;

  // Crop offsets (how much is clipped on each side)
  const offsetX = (renderedW - dw) / 2;
  const offsetY = (renderedH - dh) / 2;

  // Convert landmark (0-1 in camera) → pixel in rendered frame → pixel in viewport
  const pixelX = landmarkX * renderedW - offsetX;
  const pixelY = landmarkY * renderedH - offsetY;

  // Normalize to viewport [0, 1]
  const normX = pixelX / dw;
  const normY = pixelY / dh;

  // Apply scaleX(-1) mirror flip
  return { x: 1 - normX, y: normY };
}
