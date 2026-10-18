# KaSync experience improvements

Implement and review these stages sequentially, preserving the existing gesture contract.

## 1. Gesture feedback — implemented

The center readout and compact transport badge distinguish ready/hand found, pinch connected, playing, cut held, tracking recovery/loss, and volume/effect control. A cut keeps the pinch visibly linked and prompts the user to lift fingers to resume, rather than incorrectly asking them to pinch again. State is selected from the note-playing hand so a quality-hand gesture cannot label the note as cut.

The badge remains visible when the center readout is hidden on narrow portrait screens. Amber identifies a held cut, cyan identifies connected/playing states, and recovery uses a distinct label and color. This stage adds no gesture recognition, audio changes, inference or animation loop. A primitive gesture-phase subscription avoids React commits for landmark-only changes. Playing reflects the existing note-request state, consistent with the existing keyboard visualizer; audio signal diagnostics remain in Track.

Validation: 195 tests, production build and lint passed. Tests cover cut/resume feedback, note/quality hand distinction, controls, tracking recovery and unchanged-pose render counts. An isolated browser checked Chord/Song/Melody at 1918×1078, 1280×720, 768×900 and 390×844: the badge remained in view, cut instructions were present, and no page overflow was introduced. Synthetic hand input was used; live camera recognition was not re-evaluated.

## 2. Tactile rings — implemented

The note ring now has a brief ripple for each new note request (including repeated notes), a steady cyan outline while playing, and an amber dashed outline during a held cut. The FX ring remains independent. Rotary scales stay fixed while their value handles move; pointer adjustment, five-finger linkage and disabled FX have distinct hints. Gesture sensitivity and audio behavior are unchanged.

The ripple uses a finite 240 ms native animation, cancels on release/cut and unmount, and respects reduced motion, including preference changes. It adds no tracking work or continuous animation loop.

Validation: all 197 tests, production build and lint passed. Existing keyboard and camera dial tests still pass; new tests cover repeated requests, cancellation, subscription cleanup and reduced motion. Browser checks covered all three modes at the four sizes above, with desktop/portrait screenshots inspected. Native pulse cancellation, keyboard limits and reduced-motion suppression were also checked in the isolated browser. Synthetic input was used; this stage makes no live FPS or recognition accuracy claim.

## 3. Performance hierarchy — implemented

A persistent performance strip gives the selected note/chord a larger label beside the current instrument and gesture status, including when the central core is hidden on portrait screens. The strip and core share the same chord spelling, bass and Song section key logic.

The main dock prioritizes Play, Record, tempo and mode. Setup groups key, scale, snap, quantization, voicing and recording options; Song section navigation remains directly available. Setup and track FX use one expandable panel, with explicit close and Escape returning focus to the opener. FX indicates enabled track effects independently of panel visibility. Transport now selects only the music settings it needs, avoiding full transport rerenders on note-request updates.

Shorter windows reserve space between ring captions and the dock; narrow landscape places the selection beside primary controls. Gesture recognition and audio behavior are unchanged. Existing state/actions remain the source for every control.

Validation: the full 200-test suite passed; the seven affected transport/feedback tests passed again after the recording controls moved. Production build and lint passed. Isolated browser checks covered Chord, Song and Melody at desktop, laptop, tablet, portrait phone and short landscape sizes, including open Setup/FX panels. Controls and panels stayed within the viewport; visible captions remained clear of the closed dock. Synthetic input was used.

## 4. Sound transitions — implemented

Live volume and FX ramps now start at the audio context's immediate time, avoiding Tone's scheduler look-ahead for interactive controls. Master volume fades in linear gain over the existing 60 ms duration, including exact zero, rather than toggling mute abruptly. Playback track volume also uses an immediate start while retaining its existing duration and mute/solo behavior.

FX parameters remember their requested targets, so unchanged effect states and ordinary dial strength updates do not restart unrelated wet/feedback ramps. Reverb tail generation remains coalesced and committed on dial release. The cut/resume gate retains its 6 ms ramp, but now lets Tone hold the current in-flight value before reversing direction; cancelling the ramp first could produce a discontinuity. Preset attack/decay/sustain/release, velocity mapping, gesture thresholds and cut/lift semantics are unchanged.

Validation: all 203 tests passed; the 17 affected audio/pipeline tests passed again after switching master-volume access to the current context's destination. Native browser audio rendering at 48 kHz measured a master fade midpoint of 0.5, exact zero after the fade, and restoration to 0.8; the largest adjacent-sample gain change was 0.000348. A 6 ms gate reversal held its midpoint at 0.5 and reopened to 1. Unchanged FX requests reached their 0.8 target by 110 ms. A clean browser app load completed 21 real audio cut/resume cycles (seven per mode), with every cut silent and every return audible. These checks used synthetic gestures and do not measure camera recognition or device output latency. Production build and lint passed.

## 5. Tracking recovery — implemented

Known-hand pinch hysteresis and finger articulation now survive a short detection gap. A shared recovery budget allows two detection intervals, bounded to 90–250 ms (90 ms when cadence is unknown). This same policy applies when all hands disappear and when only the note-owning hand disappears. The deadline is established once and cannot be extended by unrelated updates.

Only detector state is retained; absent hands and landmarks are never republished. Point-motion history resets immediately across a gap, and unknown identities are not carried across missing frames. Expired state is discarded before a late return; camera/backend restarts clear the gesture memory.

A sounding note survives a short gap without a new attack. A held cut stays silent, retains its pitch through a wheel gap, and resumes only on the finger lift. Opening the pinch or taking volume/effect control cancels recovery; mode changes and unmount clear its timer. Longer loss closes the voice and discards the cached pitch. Existing feedback now shows Finding Hand while recovery is pending, including during a held cut or when the other hand remains visible.

Validation: all 219 tests passed. Regression tests cover low-FPS single-hand loss, cut/lift recovery, expiry, unknown identities, point-history reset, explicit opening, control reservation, and timer cleanup. Native browser audio checks in all three modes used synthetic 150 ms dropouts at a declared 8 FPS: held notes remained audible with no duplicate attacks; held cuts stayed silent and lifted back to the same pitch. Longer loss produced zero active voices, a closed gate and zero settled waveform RMS; stale pitches outside the wheel stayed silent and valid returns played again. These checks do not measure live camera accuracy or FPS. Production build and lint passed.

## 6. Visual consistency — implemented

Shared surface, border, text, spacing and corner tokens now unify the performance dock, side-rail headers/cards, Song navigation, captions and settings panels. Inactive instrument labels and descriptions have clearer contrast. Selects use a consistent control size and preserve caller styles instead of silently replacing them.

Mixer rows use a two-row grid so arm, instrument, mute, solo, volume and clear controls fit inside the rail. Bounded rails and thin scrollbars keep every track/instrument reachable on small screens. Compact landscape separates side rails, Song navigation and camera controls. The camera error banner has bounded sizing and its own space, including portrait layout.

The live press counter remains separate from settings scrolling. Its diagnostics area is now bounded and keyboard-scrollable so a short viewport still leaves room for settings; the panel header and close button remain fixed and visible.

Continuous decorative instrument-waveform and logo animations were removed. Instrument selection keeps a brief response without overriding each instrument's accent color. Existing note feedback and reduced-motion support remain intact. This stage adds no audio or gesture-processing changes and makes no measured FPS claim.

Validation: production build, lint and regression tests passed. Isolated browser checks covered all three modes at 1918×1078, 1280×720, 768×900, 390×844, 844×390 and 1440×400. Mixer controls fit their rows, the last track and instrument were reachable, camera banners cleared the checked header controls, and decorative waveforms were static. Track's close button stayed visible and both diagnostic/settings scroll areas remained usable. Native computed select sizes were 10 px for camera controls and 11 px in Track. Desktop, portrait and landscape screenshots were inspected.

All six planned stages are implemented. Live camera playability and device latency still need evaluation with the user's actual camera and hardware.
