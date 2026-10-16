# Pinch articulation audit — 2026-10-16

## Scope and evidence

Traced camera scheduling, model initialization/results, landmark smoothing, pinch/point recognition, per-hand state, spatial roles, wheel selection, audio ownership, looper/MIDI forwarding, the live synth/effects gate, persisted preferences, project restoration, calibration, diagnostics, and tests.

The user confirmed that release means opening thumb and index, not moving a closed pinch through camera depth. The supplied recording was reviewed locally. Direct audio rendering previously produced seven nonzero attacks when the instrument was called directly. That does not prove live input recognition.

## Confirmed recognition defects

### Distances mixed coordinate units

`computeGestures` previously took a Euclidean distance between normalized X, Y, and Z directly. The bundled MediaPipe `NormalizedLandmark` declaration specifies X by image width, Y by image height, and Z on approximately the X scale (`node_modules/@mediapipe/tasks-vision/vision.d.ts`). Thus a 16:9 image did not give all three axes comparable units. Normalizing by hand size did not cancel this error when the palm and finger gap pointed in different directions.

The recognizer now converts Y differences to image-width units using `videoHeight / videoWidth` before calculating pinch/palm/finger distances. Relative vertical tap scores, hand rotation, and point-tracker vertical motion use the same convention. Screen/wheel coordinates remain in their existing normalized display space. Tests verify invariance when the same physical hand rotates in a widescreen image.

### The release band retained partially opened pinches

The default onset was 0.32 while release required 0.44. A measured gap of 0.38 therefore remained held after an attack even though it could not start a new pinch. This is hysteresis working as written, but the broad band obstructed quick finger openings.

Onset remains 0.32; the default release is now 0.36, retaining a smaller hysteresis band. A landmark-to-audio regression models seven contact/open cycles in a 1280×720 camera. Its openings fall between 0.36 and 0.44. It verifies actual recognizer results and note releases in Chord, Song, and Melody, rather than injecting already-recognized key booleans. Hand-size changes while contact remains closed must stay legato.

### Calibration widened the required release, then persisted it

Old calibration used fractions of the distance between a fully spread hand and contact. For an open sample of 1.20 and contact of 0.08, it produced onset ≈0.394 and release ≈0.562. Small repeated openings would not release that pinch. Calibration also read the first hand without checking that both samples came from one hand.

New calibration learns close to contact with a release band of 0.03–0.05. The same samples yield approximately 0.18 / 0.23. Both steps now require the same single detected handedness and use the current hand-store measurement. Invalid or overlapping samples are rejected.

Calibration is now metric-versioned. Old local preferences and imported/autosaved project tracking settings cannot restore calibration calculated with the incompatible geometry. Only those pinch thresholds revert to current defaults; other camera preferences and project content remain intact. New calibration survives save/reload. Nonfinite or string thresholds are rejected rather than silently poisoning the comparisons.

## Routing defects already found during demo investigation

The pending audio changes retain two corrections: the chord-quality hand cannot steal articulation from the note hand in a two-hand pair, and a point signal cannot sustain a voice whose initiating pinch has opened. Solo-to-pair hand transitions are covered as well. These were code-level routing failures; the recording alone did not establish which one occurred at each physical release.

Audio also continues to run after wheel subscribers resolve each detection. This avoids attacking a stale pitch and then attacking the new pitch from the same camera frame. No next-frame delay is added.

## What the recording replay could and could not show

An isolated browser used the bundled model and local WASM. A direct-video replay returned no hands. A cropped IMAGE-mode replay of 101 samples from 34–44 seconds detected a hand in only 13 samples, so it is unsuitable for scoring gesture recall or counting the original user's missed releases. The screen recording includes wheel overlays and differs from the original camera input.

Those detected samples included old-metric gaps around 0.364, 0.388, and 0.383, which can remain in the old held band. These are approximate re-detections, not recovered original landmarks or ground-truth labels. They motivated testing the threshold band; they do not justify claiming a measured live accuracy improvement.

## Diagnostics and interpretation

Track now displays each detected hand's actual pinch gap and open/closed classification, the onset/release thresholds, and the notes requested by the audio hook. The counter is explicitly labelled as input presses across all hands, not audible notes. Numeric exports now include per-hand gap, point state, and spatial role alongside press IDs, thresholds, selected pitch, and requested notes. No new camera-image recording is added.

If the problem persists:

- Fingers visibly open, but Track says **PINCH CLOSED** and gap stays below the release threshold: recognition/model/geometry remains the failing stage.
- Track says **PINCH OPEN** while an audio request remains held: inspect routing and any **AIR TAP** state in the capture.
- Track says **released** but sound remains audible: investigate loop playback, other audio inputs, and rendering/effects, rather than changing pinch thresholds.

## Limits and remaining risks

At 8–10 completed detections/sec, observations are about 100–125 ms apart; at 14.8/sec they are about 68 ms apart. A complete close/open motion between observations is unobservable to the gesture state machine. This audit does not claim an FPS increase or that quick articulation is reliable at those rates.

Monocular depth estimates, thumb/index occlusion, handedness changes, and independent unpinched air-tap detection still need live measurements. Model replacement and smaller inference inputs are not justified by this audit; earlier bitmap/worker paths had compatibility problems. Automated tests verify the corrected geometry and routing, not human-level playing accuracy.

## Closed-pinch whole-hand articulation (2026-10-16)

The intended gesture keeps thumb and index touching while the hand presses toward the camera and lifts back. Finger bending alone does not cover that motion. The tracker now fits camera-relative translation using five palm projections and MediaPipe world landmarks, which are preserved in both main and worker results. This uses the existing model; no extra inference or depth sensor is introduced.

The fit uses an assumed focal length, so depth is relative and uncalibrated. Translation is normalized by palm size to cancel uniform world-size changes. A forward stroke greater than 0.24 palm spans re-strikes the held key; retreat greater than 0.12 spans from that stroke's peak releases it while the pinch stays closed. Closing the pinch still starts a note immediately, and opening always releases. A hold has no duration limit imposed by this detector. Events are driven by new observations, without an added dwell timer.

Sideways/up-down travel and palm rotation rebase the motion reference without manufacturing audio edges. One quiet observation after navigation restores motion recognition. Missing or inconsistent geometry also rebases and preserves the current key state, so close/open remains the fallback. Up/down is reserved for wheel navigation, not a second press axis: those intents cannot reliably be distinguished from hand trajectory alone. The Track status now shows key down/up and navigation, press, lift, or 3D motion unavailable.

Validation: synthetic image/world landmarks exercise repeated closed-pinch strokes through the real classifier, tracker, hand store and audio hook in Chord, Song and Melody. Tests also cover rotation, navigation, jitter, uniform world scaling, geometry loss and raw motion despite heavy display smoothing. An isolated CPU replay of 21 cropped screen-recording frames produced only four hand detections; all four yielded valid fits (relative reprojection errors 0.042–0.096). The recording has wheel overlays and is not suitable for establishing live gesture accuracy, event counts, or latency. Live camera verification is still required. This change does not increase inference FPS; a press/lift occurring entirely between two observations remains unobservable.

## Initial three-free-finger behavior (superseded by cut/resume below)

The user chose performed, free note lengths rather than fixed quarter/eighth/sixteenth durations or repeating rhythms. Close thumb/index with the other fingers relaxed to sound the selected pitch and capture their rest angles. While holding that pinch, bending middle, ring or little finger re-strikes; lifting the last bent finger to rest releases. A bend can be held for any performed duration. Separate finger onsets re-strike once; simultaneous finger onsets become one hit. Thumb/index opening always releases and resets the rest pose.

This supersedes the forward/back articulation described above. Camera-relative palm translation is no longer consulted in the live press path, so hand distance and note navigation cannot generate a key edge by themselves. The same model's raw world landmarks supply finger joint angles; image landmarks with corrected aspect are the fallback. PIP flexion and angle out of the palm plane cover curling and knuckle presses while excluding natural finger splay. The first bend requires 0.14*pi (~25 degrees) above the initial rest. Once a finger has performed a press/lift, both the next press and lift require 0.085*pi (~15 degrees) from the latest trough/peak. Returning to the same peak after a short lift can therefore re-strike, rather than entering a silent dead band. On release, rest rebases to the lifted pose and follows any further straightening. A partial lift can therefore rearm the next same-chord press without returning to the straightest pose seen during the pinch. These thresholds are separate from the unchanged thumb/index pinch thresholds.

Each finger maintains its own hysteresis and rest baseline. Invalid unpressed fingers rebase when reacquired without striking. Invalid held fingers preserve their key until a valid lift or pinch opening, avoiding an invented release from missing joints. The Track panel displays each finger as rest, DOWN or unavailable. No extra model inference, scheduled note lengths, tempo grid or timers are added. Camera sampling still limits observable performance: bend/lift motions entirely between observations cannot be recovered, and the ring/little fingers can naturally move together. Live comfort/accuracy remains to be verified by the user.

Regression coverage includes seven repeated bend/lift articulations in Chord, Song and Melody, all three individual fingers, overlapping/simultaneous fingers, relaxed starting poses, jitter, missing joints, image fallback, rigid rotation/scale, navigation, basic pinch release and raw landmark processing despite heavy position smoothing.

Same-chord rearm regression: the former fixed-rest release missed a lift from curl 0.50 to 0.32 after starting at 0.20, so the next press had no new onset. Synthetic camera/world landmarks now exercise seven partial-lift repetitions in all three modes, sustained holds, and returning to the same pitch after navigation. The App/recorder/instrument test also checks that each repeated chord attacks the synth and reopens its output gate, with each lift closing it. These automated checks do not establish live camera accuracy or an inference-speed improvement.

## Requested chord remains visible during silence

A requested chord is UI state, not a measurement of audible output. A separate routing regression discarded an explicit `finger-press` when its detector-local ID was lower than the previous ID, which can restart on tracking loss. New explicit finger strikes now use changed-ID detection in addition to the existing rising-ID/key-down rules. Repeated notifications for the same event still do not retrigger, and reacquiring a held pinch alone still preserves the existing dropout behavior. Regression tests cover Chord, Song and Melody.

Track now reports engine context, master volume/mute, synth attack calls, active voice count and output-gate gain. These values are read four times per second only while Track is open; there is no new inference or permanent audio-processing node. Synth attacks count attack calls, and active voices can include release tails; neither proves that the device produced audible sound. These diagnostics distinguish a stale requested chord from a missing attack, a closed gate, a zero master level, or a suspended audio context without changing gesture thresholds.

## Short-stroke rearm and waveform audit

The earlier partial-lift fix still allowed a dead band: a lift of 0.095 released the key, but returning by the same 0.095 was below the next press threshold of 0.14. The first hit sounded; subsequent identical motions remained key-up. A failing regression now covers this exact sequence independently for middle, ring and little fingers. Repeat presses now use the same 0.085 travel as releases, including equality at the boundary. The more conservative initial-press threshold is retained. Unavailable unpressed joints rebase on reacquisition without an attack, but do not erase the already established repeat threshold. Pinch opening still resets all finger state.

Landmark-to-audio tests now use a short 1.4-to-1.1-radian finger bend/lift, rather than a larger lift that hid this mismatch. In an isolated headless Edge session, synthetic landmarks passed through the real App, wheel selection, audio hook, recorder and Tone.js graph. Seven repeated short strokes generated nonzero post-FX waveforms in each of Chord, Song and Melody (21 hits), including C#3/C#4/F4/G#4 in Song. Attack samples were approximately 0.03–0.21 RMS. These are synthetic-input audio checks, not live model accuracy measurements or proof that the user's silent session is resolved.

The user subsequently confirmed increasing synth attack calls, four voices and an open gate while hearing silence. That rules out an ignored attack for that specific observed sequence, so further recognition-threshold changes are not evidence-based remedies for that silence. Track now additionally measures dry synth and post-FX/limiter signal levels in dB. Two small meters are connected only while Track is open and are disconnected/disposed on close; they reconnect on instrument changes. A silent dry signal points inside the synth; a nonzero dry signal with silent output points downstream through effects/gate/limiter; nonzero post-FX signal requires examining destination/device output. Master mute/volume and context state remain separately visible. An instantaneous meter can miss a short note; hold a finger bend for a second when reporting these readings.

## Held-gesture false release

Live readings subsequently showed nonzero synth/post-FX waveforms while playing and zero voices/closed gate after a stop. The user confirmed the pinch and playing finger were physically held at that stop. This establishes an unwanted stop, but snapshots alone do not distinguish a false finger lift, a false pinch opening, hand loss or role changes.

A regression reproduced one concrete false-release hazard: after rest 0.20 and press 0.50, a single high estimate of 0.67 raised the all-time peak. Returning to the actual 0.50 hold then exceeded the lift distance and stopped the key. Deeper held references now use the minimum of two consecutive valid held samples, so one high outlier cannot raise the reference. Initial press timing and release from an established hold remain immediate; no dwell timer or gesture smoothing is added. Missing samples break peak corroboration while preserving the held key. Legitimate deeper holds still establish a new peak after two agreeing samples. A low outlier can still resemble a real fast lift; this change does not claim to reject all landmark noise.

Track retains a `Last stop` cause and time since the latest attack request, distinguishing finger-lift, pinch-open, point-lift, key-up, hand-lost, control-hand, mode-change and cleanup. This snapshot is recorded only on actual owned-voice stops, survives later idle/hold frames, and is included in numeric captures together with finger curls/active fingers. It allows the next live failure to be attributed to a release path rather than changing unrelated audio/model settings.

## Current behavior: down cuts, up resumes the closed-pinch chord

The user clarified the intended cycle: the downward free-finger press should cut the sound, a prolonged downward hold should stay silent, and returning up should restart the same selected chord without opening the pinch or moving away. The previous bend-to-play/lift-to-stop mapping contradicted that expectation; an up pose remaining silent was intentional in the old code, not evidence of an audio engine failure.

The closed pinch now starts/sustains the selected pitch. Bending middle, ring or little finger sets the audio key off immediately. While any pressed finger remains down, subsequent detections remain silent with no timed restart. When the last pressed finger lifts, the tracker increments the play-onset ID and turns the key on again. A steady up pose sustains without repeated attacks. Opening the pinch always stops and resets the cycle. This applies to Chord, Song and Melody; no articulation menu or rhythm timer is added.

The audio hook preserves the last played root/quality/bass for that closed pinch across a finger-press cut. If the upward return briefly lies in a wheel gap, it can restart that latched pitch; a valid new hovered selection takes precedence. Pinch opening, hand removal, control-hand reservation or mode change invalidates the latch, so it does not leak into a new gesture. Regression coverage checks repeated same-chord up/down/up cycles, prolonged silent down states, partial lifts, overlapping fingers, steady up holds, raw main/worker edges, audio gate reopening, and gap recovery in all modes. Earlier sections describe the diagnostic history rather than the current gesture contract.

Native audio validation of this mapping: an isolated Edge browser drove seven cut/resume cycles through the real App in each of Chord, Song and Melody. Every downward hold measured zero post-FX RMS, including a 650 ms hold, and all 21 upward returns produced nonzero audio (minimum return RMS approximately 0.091 for Chord/Song and 0.035 for Melody). The chord modes retained C#3/C#4/F4/G#4; Melody retained C#4. These synthetic-input checks confirm the implemented cut/resume behavior and do not establish live camera recognition accuracy.
