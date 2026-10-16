# Tracking performance and accuracy

## Audited assets

- Installed runtime: `@mediapipe/tasks-vision` 0.10.3.
- `public/hand_landmarker.task`: 7,819,105 bytes; contains `hand_detector.tflite` and `hand_landmarks_detector.tflite`.
- Model SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
- All four local WASM/loader files match the installed package byte for byte.
- This verifies local consistency, not model provenance or detection accuracy.
- GPU is attempted first in a worker, with CPU and main-thread fallbacks. Two-hand detection and the existing confidence thresholds remain enabled.

## Measurements

Open Hand Tracking Settings after allowing the camera. The backend label identifies which path actually initialized. FPS target is a scheduling budget; Actual tracking counts completed detections, including empty results.

Frame capture is the time to create the transferable camera bitmap. Pipeline time starts when a frame is selected for inference and ends after gesture processing and hand-store publication. It includes capture, worker transfer/queueing, inference, processing, and synchronous subscriber work. It excludes sensor exposure, camera/decoder buffering before frame selection, screen presentation, and audio output. The existing inference readout measures the detector call alone.

Averages and p95 use at most the last 120 completed frames, update no more than twice a second, and reset on tracking restart. p95 is the 95th percentile of pipeline times; it highlights slow frames hidden by the average. No images or landmarks are recorded by these diagnostics. The system report includes these numeric measurements.

## Repeatable device comparison

1. Keep the same camera, browser, lighting, hand distance, and viewport; close other camera users.
2. Let tracking warm up for ten seconds, then inspect one hand and two hands for thirty seconds each. Record backend, actual FPS, capture, inference, pipeline average, and p95.
3. Repeat open hands, pinch/release, air taps, wrist rotation with a stationary fingertip, hand replacement, and hand crossing. Count missed strikes, unwanted strikes, and lost-hand intervals separately. Confidence alone is not an accuracy score.
4. Compare the existing Auto, Audio priority, and High quality modes with the same motions. Keep a setting only if the measured response and gesture reliability improve together. These presets change both frame budget and input resolution, so report both.
5. For an actual model replacement, replay identical annotated clips before/after and compare detection/landmark errors and gesture errors alongside timings. No annotated dataset or device benchmark was available for this change, so no accuracy percentage or speed multiplier is claimed.

## Corrections in this pass

- Process each decoded camera frame at most once in the animation-frame fallback.
- Publish fresh palm, rotation, depth, velocity, and landmark changes even when the index fingertip is nearly stationary. This intentionally removes approximate whole-frame suppression; React consumers can select the fields they need.
- Reset a hand's smoothing history when its handedness identity changes. The original smoothing formula is preserved for continuous tracking; this is not a full occlusion/crossing identity tracker.

Reference: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js

## Capture from the Track menu

The Track controls and panel sit at the lower left. Open **Speed & gesture capture** and choose **Speed only** to move freely, or select a single expected pose for a hold test. Start capture, use the three-second preparation period to position your hand, then hold the labelled pose for the thirty-second window. Stop early if needed. Recording continues when the panel is closed. Export JSON before reloading.

The export includes completed-frame timings, gesture flags, detected hand count, per-frame backend and settings, and session averages/p95. Pose agreement is the fraction of completed detections matching your selected label; unprocessed frames are not scored. No video/images or landmark coordinates are saved. This supports device comparisons and labelled hold checks, not an overall model-accuracy claim or gesture transition latency benchmark.

## Worker compatibility and fallback input

The installed 0.10.3 loader uses `importScripts()` for its WASM glue. The tracking entry is now bundled as an IIFE and launched as a classic worker. A Vite plugin serves the same bundled entry during development and emits `hand-tracking.worker.js` for production, without changing the installed runtime or copying a separate SDK version.

Main-thread fallback now reuses a canvas at the existing preset resolution (Auto: width 460; High quality: 540; Audio/Performance: 400; low-performance mode: 360), preserving aspect ratio and avoiding upscaling. If a 2D canvas cannot be created, direct-video inference remains available. Tracking settings, system reports, and capture frames expose actual input dimensions and the worker fallback reason. These changes require a fresh device capture to establish their speed and gesture reliability impact.

## GPU versus CPU benchmark

In Track, open **GPU vs CPU benchmark** and choose **Compare GPU / CPU**. Move your hands while twelve distinct decoded frames are collected at the current resolution preset. The same in-memory clip is replayed through separate GPU and CPU detector instances with identical VIDEO timestamps, model asset and confidence settings. Only one benchmark detector runs at a time, with a full untimed warm-up pass followed by two timed passes (24 timings per backend). Backend order is randomized each run.

Live inference pauses and held gesture notes are released during the test; it resumes on completion, cancellation, failure or timeout. The ordinary capture cannot run simultaneously through the menu. Camera changes cancel the test. The active live backend is not changed automatically.

Results report mean, median and p95 detector-call time, initialization time, per-frame detected hand count, and paired hand-count agreement. The displayed multiplier compares average detector-call times only; it is not live FPS, an end-to-end speedup, or an accuracy score. A short clip may not represent extended sessions. Repeat with representative one-hand/two-hand motions and compare multiple runs. The live detector remains allocated but inactive and the app keeps rendering, so results include the current app/device context rather than an isolated hardware benchmark.

A failed GPU or CPU initialization is reported explicitly; the test never substitutes another delegate while claiming to measure the requested one. Images are transferred only to a same-origin local worker and discarded on finish/cancellation; exports contain numeric results and configuration metadata only. No images or landmarks are saved or uploaded.

## Compatible input recovery

Live tracking defaults to **Compatible camera**, which feeds the original HTML video element directly into the main-thread detector. This deliberately bypasses resized bitmap/canvas input while the empty-detection worker issue is investigated. The earlier device capture confirmed hands on this path; it is a compatibility baseline, not a claimed speed improvement. Worker input remains explicitly experimental.

**Restore live tracking** cancels any benchmark, selects the compatible path, and recreates the detector without requesting a new camera stream or changing music controls. Benchmarks also recreate the live detector on completion, failure or cancellation. Runs with no detected hands now show an explicit warning instead of a speed-winner recommendation. Input transport correctness and true camera detection still need device validation; mocked unit tests do not establish model accuracy.

## Point / air-tap staccato

Live tap recognition now uses per-hand motion history from unsmoothed landmarks. A static pointing pose on arrival does not strike: move the index down or forward, then lift/pull back before the next strike. The channel that initiated a tap owns its release, so static forward depth cannot keep a vertical tap held. Tracking restart and missing hands clear that history. Pinch thresholds, model and position smoothing are unchanged.

Each tap re-strikes the selected live note/chord and chokes it after 100 ms without waiting for another camera frame. Sustained pinch holds still work; a tap can interrupt one, and held inputs must relax before resuming a pinch hold. In Song mode, the playing hand taps notes while the other hand retains momentary FX behavior. Chokes bypass sustain and gate the live output after effects with a 6 ms fade; loop playback is separate. The output gate reopens only on a fresh note attack. Very fast movements can still be missed between camera detections; this change does not claim improved model inference speed or measured hardware latency.

For a camera check, use Compatible camera, select a note, show a relaxed hand, then tap down/lift five times and push/pull five times. Expect one short hit per motion and silence while the pointing pose is held. Check a pinch hold still sustains, and a tap interrupts it. Compare dry sound and sustain/reverb/delay. Capture point-frame agreement reports active-frame occupancy during this sequence, not tap-event recall or overall accuracy; count intended, missed and unwanted strikes separately.

### Follow-up: missed air taps and sustained fall-through

A tap could arrive while hoveredRoot was still null, before the wheel subscriber resolved its selected pitch. The rising edge was consumed, and the later wheel update treated the held point as a sustained trigger. Tap edges now remain pending until a pitch exists, and only pinches enter sustained note playback. Regression tests reproduce the old ordering failure in Chord, Song and Melody; the app pipeline test exercises the wheel, actual looper and instrument gate together with mocked Tone nodes.

The tap tracker accepts relative index flexion even when the tip remains above the PIP joint or bends out of its extended pose during the strike. An initially extended reference pose and a retreat are still required. Each strike schedules its 100 ms gate cutoff directly on the Web Audio timeline; the JavaScript timer handles MIDI, recording and UI cleanup, and may run later during main-thread stalls. Track now shows live RELAXED/PINCH/TAP flags and a detected tap counter while open. This distinguishes recognition failures from sound-release failures during device validation. Tests verify scheduling and routing; they do not measure actual camera tap recall or audible latency.

### Rigid presses and explicit articulation

Straight-finger/whole-hand presses can leave normalized joint bend and relative landmark depth unchanged. The live tracker now also watches downward camera-space fingertip motion normalized by the reference hand size, and apparent hand-size increase for an approach gesture. It still requires retreat before rearming. Apparent size is a camera heuristic, not measured physical depth; rotation or large vertical repositioning can also activate it. Small stationary jitter, repeated strikes, and release/rearm sequences have regression coverage; device recall still requires camera validation.

Track's live gesture block now sits outside the scrollable controls, directly under the header. Choose **Note articulation → Staccato · short hits** for short notes even when thumb proximity classifies the pose as a pinch. This option applies the existing timed audio gate to a new pinch as well as a motion tap; rigid press motion can retrigger while pinch proximity persists. **Gesture / hold** remains the default and preserves sustained pinch behavior and thresholds. The choice is saved in preferences and project documents. **Test short note**, with hands outside the camera view, bypasses gesture recognition and exercises the selected live instrument and audio gate. The center readout now follows playingNotes rather than treating a held gesture as proof of audible playback.

## Current behavior: performed pinch key-down / key-up

This supersedes the earlier fixed 100 ms staccato option. The articulation selector, fixed-duration audio scheduling, and short-note test button have been removed. A pinch starts a note; keeping the pinch pressed holds it. Small downward/forward motion of the closed pinch re-strikes it, and a backward/upward reversal releases it even while thumb/index proximity still classifies as a pinch. Pressing again re-attacks the same pitch. Duration is performed by the user, rather than forced to a fixed duration or quantized to quarter/eighth notes. Strike speed supplies bounded velocity for emphasis.

PinchPressTracker uses raw normalized tip movement and apparent hand-size change with separate press/release deadbands. Apparent size is a monocular approach proxy, not physical depth. Motion state and the initiating channel persist through a held pinch; losing the hand or opening the pinch clears them. The original pinch thresholds, model, input resolution and position smoothing remain unchanged. A note-owning hand controls release so another stationary pinch cannot mask key-up. Song mode keeps the right-hand momentary effects role. Intentional key-up uses the live post-effects choke, bypasses sustain, and sends the normal MIDI/recording release through the looper. A brief 90 ms no-hands guard remains.

The pinned Track diagnostics now show PRESSED or LIFTED / PINCHED and count presses. Tests cover variable hold durations, quick release, same-pitch re-strikes, closed-pinch pull-back/press cycles, jitter, motion velocity, two-hand release, wheel-selection ordering, and landmark-to-key-state integration. They do not establish device gesture recall or physical motion resolution. At the observed camera/inference cadence, motions entirely between detections may still be missed. Model replacement is not established as necessary by these results.

## Latency follow-up for reported 8–10 tracking FPS

Pinch activation/deactivation now uses unsmoothed landmarks with the same previous-pinch hysteresis and thresholds. Position smoothing still controls wheel/overlay coordinates, but no longer delays pinch key edges. A regression test uses smoothing alpha 0.05 and verifies prompt open/close events and press/release motion through the real tracking hook.

Main-thread inference runs directly from the decoded-frame callback instead of an additional zero-delay timer. The next frame callback is registered before inference, preserving a pending request while the synchronous detector runs. Duplicate video frames and concurrent worker requests remain suppressed. Long-hold watchdog renewal only follows new hand-store updates, not music-store notifications.

The overlay has no time-driven animation, so identical hand data is no longer cleared/reprojected/redrawn at display FPS. New detections, visibility/mirror/tracking changes, camera dimensions and canvas resize invalidate it. A regression test verifies unchanged-frame skipping and fresh-data/settings redraws.

At 8–10 completed results per second, the interval between hand observations is approximately 100–125 ms, before additional audio/device delays. The changes remove avoidable work/waits; they do not establish a measured inference speedup. Camera/model/thresholds/resolution are unchanged. Repeat the same closed-pinch presses after refresh and compare actual tracking FPS and pipeline average/p95 before considering input/model changes.

## Navigation versus intentional articulation

Closed-pinch articulation now uses push/pull depth motion only; screen-space vertical movement is reserved for note navigation. This supersedes the earlier downward/upward pinch mapping, which could choke notes while the user moved between wheel sectors. A palm-plane navigation guard compensates for perspective during pure off-centre camera approach and rebases depth during dominant lateral/vertical movement. Wrist rotation and palm tilt/yaw changes also rebase the reference. Navigation preserves both held and lifted states and does not increment the press id. A depth press can be accepted on the very next result after navigating; there is no dwell, confirmation-frame or time-based release delay added.

The guard is a heuristic for monocular camera landmarks, not proof of user intent or physical depth. Ambiguous diagonal/rotating presses may be suppressed to prioritize avoiding accidental cuts. Real camera validation should include lateral, vertical and diagonal note changes with incidental distance variation, followed by stationary push/hold/pull sequences. Model, confidence thresholds, camera resolution and pinch thresholds remain unchanged.

The hand store now publishes isTracking together with raw/smoothed hands so wheel subscribers can use the first result rather than receiving hands with a stale readiness flag and requiring another notification. Regression tests cover diagonal navigation with depth changes, screen-vertical navigation, rotation/tilt, off-centre perspective, immediate depth presses after navigation, preserving a lifted state, and the note/audio path in Chord, Song and Melody without navigation chokes.

These changes address false articulation and an avoidable first-frame ordering delay. The previously reported 8–10 tracking FPS still implies observations roughly 100–125 ms apart; these tests do not establish a live FPS improvement or eliminate that camera/inference sampling limit.

## Reproduced follow-up failures: fingertip navigation and owner loss

The palm-only guard missed fingertip sweeps with a nearly stationary palm. Regression tests reproduced a false release from that motion and a separate immediate choke/voice steal when the owning hand briefly disappeared while the other hand remained visible, in all three playing modes.

Navigation gating now considers fingertip motion as well as palm movement, accepting both perspective-scaling and screen-stationary camera approaches. A closed pinch remains a legato hold until a forward stroke arms depth release; incidental shrinkage before that stroke cannot cut the hold. Navigation disarms depth release again. Consequently, start a depth articulation by pushing forward, then pull back to release; simply opening the pinch still releases immediately. Reacquisition with a reset press counter is not a new strike while a held owner is being bridged.

Owner loss now uses the dropout guard even if another hand is visible, and prevents voice stealing during that guard. With another hand visible, its length follows two observed frame intervals, bounded to 90–250 ms; at 8 FPS, the prior 90 ms was shorter than a single 125 ms observation interval. All-hands loss retains 90 ms. Visible key-up/unpinch remains immediate and has no added confirmation delay.

Existing numeric tracking exports now include each hand's key state, pinch flag, press id and articulation reason, alongside selected root/quality and current playing-note state. No image or landmark coordinates were added. This allows the next real capture to distinguish classifier transitions from hand loss and note changes. Automated regression results do not establish live camera false-positive rates or an increase over the reported 8–10 FPS.

## Correction: remove inferred depth articulation (2026-10-16)

Live feedback continued to show false releases and silent note transitions. The earlier depth-press sections above describe a superseded experiment, not current behavior. PinchPressTracker now derives key-down solely from the existing hysteretic pinch classifier. Hand size, screen motion, rotation, and estimated depth cannot release or re-strike a closed pinch. Opening releases; closing again re-strikes. Short and long performed pinch durations remain supported without a fixed gate or dwell timer.

A held key also preserves the sounding note across null wheel selection, then changes pitch when the next segment resolves. Regression coverage runs this sequence in Chord, Song, and Melody with approach/retreat scale changes.

This restores predictable pinch playback but does not fulfill closed-pinch forward/backward articulation. That gesture needs a separately validated signal before controlling audio again. No live-camera accuracy or FPS improvement is claimed.

## Repeated-note routing correction (2026-10-16)

The full App regression reproduced stale-pitch attacks: on the second explicit pinch the recorded attacks were C4, B4, C4 instead of two C4 attacks. The hand subscriber could attack before RootWheel had resolved that detection's selection; music-store notifications then attacked again. This depended on subscriber registration order, including component remounts.

Hand state now offers a synchronous completed-frame subscription. Audio processes a detection only after normal hand subscribers (including note wheels) finish. Music notifications during hand publication are not independently interpreted as new audio input. There is no next-frame wait or timeout. UI-driven pitch changes outside detection still trigger normally.

Regression coverage includes seven pinch close/open cycles at the same pitch followed by another wheel note through App, plus Chord/Song/Melody checks with a wheel subscriber registered after audio. An isolated browser OfflineAudioContext render of the real InstrumentService also produced nonzero audio for all seven direct attacks (peaks approximately 0.32), including a pitch change. This proves the isolated renderer can repeat; it does not establish that the user's live-camera failure is fully resolved.
