# The ambient screens

The three spare CRTs in the room show an ambient screen: the git log, the lab traffic and the security puzzle
(spec #280). They are drawn on a canvas, into the glass's texture, as the title cards and the desk meter's glow are.
They are decoration, with no click and no hover.

- **They aren't content.** ADR-0001 says text on the screens is real HTML. These screens carry no text a visitor
  needs: the words on them (`ui.ambient`) and the commit lines are texture, and the site's content is the same without
  them. So ADR-0001's real-HTML rule does not cover them, and they have no HTML twin. The live-status word rule
  still applies to their words, because nothing on a TV may look like live data.
- **They redraw only at the landscape overview.** The room is drawn on demand, and a room at rest draws no frames.
  The screens move, so something must ask for frames. A timer redraws their textures and asks for a frame about every
  83 ms (about 12 a second), only while the visitor is at the overview, in the landscape framing, with no flight running
  and without reduced motion. `ambientRedraws` in `src/ambient/redraw.ts` is that rule, as a pure function. The canvas
  keeps `frameloop="demand"`.
- **Otherwise they stop.** At a station, in a flight, in the portrait framing and under reduced motion the timer is
  off and nothing draws: the idle rule (a room at rest draws no frames) still holds everywhere but the landscape
  overview, where it gives way to the screens. A flight and the camera's easing draw frames as before.
- **A still frame on phones and under reduced motion.** Where the screens don't redraw, each holds one still frame,
  drawn at `STILL_T` (`src/ambient/still.ts`): the newest commits at the top, the dots in place, "SECURE" solved. When
  the timer stops it puts that frame back, so a screen never freezes half-way through a move.

The cost, and why it is accepted: the landscape overview draws about 12 frames a second for as long as the visitor
rests there, on a desktop. A phone, where the battery matters most, gets the still frame. If that cost turns out too
high, lower the rate in `REDRAW_MS` before removing the screens.
