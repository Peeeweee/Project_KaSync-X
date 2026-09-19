import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let handLandmarker: HandLandmarker | null = null;
let lastVideoTime = -1;

async function init() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      self.location.origin + '/wasm'
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    self.postMessage({ type: 'INIT_DONE' });
  } catch (error) {
    console.error('Failed to initialize HandLandmarker:', error);
    self.postMessage({ type: 'INIT_ERROR', error: String(error) });
  }
}

self.onmessage = (e) => {
  const { type, image, timestamp } = e.data;

  if (type === 'INIT') {
    init();
  } else if (type === 'PROCESS' && handLandmarker && image) {
    if (timestamp > lastVideoTime) {
      const results = handLandmarker.detectForVideo(image, timestamp);
      lastVideoTime = timestamp;

      self.postMessage({
        type: 'RESULTS',
        landmarks: results.landmarks,
        handednesses: results.handednesses,
      });
    }
    // Always close the ImageBitmap to prevent memory leaks
    image.close();
  }
};
