# Open-palm performance rings

Show an open hand with all five fingers extended and facing the camera over a circle. Five indicator dots and `5 / 5 · TURN WRIST` confirm that the pose is recognized. Rotate the wrist in the camera plane, like turning a dial; moving the whole hand around the circle is not required.

- Left circle: master volume. Clockwise raises it; counterclockwise lowers it.
- Right circle: strength of enabled effects, plus delay/reverb tail length. Clockwise means stronger and longer.
- Lower the hand out of the circle to leave the value there, then reposition and open it again for another turn. A half-turn spans the full control range.

Both rings are shown in Chord, Song and Melody. Melody notes now occupy the left wheel so the volume/FX sides stay consistent. The note and chord wedges retain their original selection and pinch articulation behavior. Mouse/touch dragging and keyboard controls remain available on the ring itself.

Enable the desired FX through the existing FX controls first. The right ring does not automatically enable a new effect. Strength applies to enabled chorus, bitcrusher, delay and reverb; duration changes the delay feedback and reverb decay. Sustain remains its existing on/off behavior. At 50% the original wet levels, delay feedback 0.35 and reverb decay 2 seconds are preserved. The upper duration limit is 3.7 seconds for reverb and feedback 0.6 for delay. Effect-dial levels are performance state, not yet part of saved project files.

## Efficiency and safeguards

The detector uses the existing 21 hand landmarks: joint angles verify five extended fingers, and the five fingertip positions validate a wrist rotation. Translation and scale are removed from that comparison. Image aspect and mirror settings are respected. An eight-degree initial turn engages value changes; a two-degree deadband limits subsequent jitter. Implausible rotations/shape changes rebase the reference, and partial/closed/lost hands disengage. Recognized control hands are reserved from note attacks, FX selection and instrument swipes; a second note hand can keep playing while the right palm shapes FX.

No extra model, inference, polling or animation loop is introduced. Camera updates use cached layout and direct store/audio subscriptions. Wet levels update while turning. Duration commits when the gesture ends, including mouse/key controls. Reverb impulse responses are serialized and coalesced rather than regenerated per camera frame. Disabled effects do no extra audio work on dial changes. Live camera FPS still limits response speed.

## Verification

Synthetic landmark tests cover extension/curling, five-tip shape validation, translation, approach/scale, mirrored wrist motion, jumps, release/loss, independent controls and real effect-node parameters. App integration tests retain repeated-note articulation and recording at the new left Melody wheel. Camera gesture accuracy and comfort still require a live user check.
