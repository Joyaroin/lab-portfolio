# The ambient screens, and the ambient surfaces

The three spare CRTs in the room show an ambient screen: the git log, the lab traffic and the security puzzle
(spec #280). They are drawn on a canvas, into the glass's texture, as the title cards and the desk meter's glow are.
They are decoration, with no click and no hover.
One screen is also a click target, by a separate object: the desk phone's display (`desk-phone` in `src/room-layout.json`) is an ambient surface like these, and the whole phone around it (`desk-phone-target`) is a click target that visits About me / Contact (ADR-0005, #386). The display itself takes no click and no hover: the target is its own invisible plane, and it takes the click whether the display is lit or not.

Spec #335 adds more moving things to the room: the ambient screens become **ambient surfaces**, and the three spare
CRTs' screens are the first three. Everything below holds for every surface, "screens" read as "surfaces" except where
a CRT is named: a surface is a canvas texture on a plane the room places over a baked prop, and it is decoration.

- **They aren't content.** ADR-0001 says text on the screens is real HTML. These screens carry no text a visitor
  needs: the words on them (`ui.ambient`) and the commit lines are texture, and the site's content is the same without
  them. So ADR-0001's real-HTML rule does not cover them, and they have no HTML twin. The live-status word rule
  still applies to their words, because nothing on a TV may look like live data. (The one exception is the Last watched
  line, a live title in page text: ADR-0008.)
- **They redraw only at the landscape overview.** The room is drawn on demand, and a room at rest draws no frames.
  The screens move, so something must ask for frames. A timer redraws their textures and asks for a frame about every
  83 ms (about 12 a second), only while the visitor is at the overview, in the landscape framing, with no flight running
  and without reduced motion. `ambientRedraws` in `src/ambient/redraw.ts` is that rule, as a pure function. The canvas
  keeps `frameloop="demand"`.
- **Otherwise they stop.** At a station, in a flight, in the portrait framing and under reduced motion the timer is
  off and nothing draws: the idle rule (a room at rest draws no frames) still holds everywhere but the landscape
  overview, where it gives way to the screens. A flight and the camera's easing draw frames as before.
- **A still frame in the portrait framing and under reduced motion.** Where the screens don't redraw, each holds one still frame,
  drawn at `STILL_T` (`src/ambient/still.ts`): the newest commits at the top, the dots in place, "SECURE" solved. When
  the timer stops it puts that frame back, so a screen never freezes half-way through a move.

**One list, one timer, one stop (#378).** The surfaces are one list, `ambientSurfaces` in `src/ambient/surfaces.ts`: a pure module with,
for each, its id, its canvas size, its `draw(ctx, t)` and its plane (centre, yaw, size and tilt: the three CRTs' by `phosphorFrame`,
every other's read by id from its entry in `src/room-layout.json`). `src/Phosphor.tsx` draws one mesh per entry and names none, so a
surface ticket edits only its own entry. One timer (`createAmbientRedraw`) ticks every filled surface at `t`; when it stops, each gets
its still frame back, drawn at `STILL_T`. A surface whose `draw` says its frame hasn't changed isn't uploaded on that tick. The
**phase rule**: each surface's cycle shows its still frame at `STILL_T` (`cyclePosition` in `src/ambient/phase.ts`). The **budget**:
all the canvases together, the three screens and every placeholder's reserved size, paint at most 600k px a tick; a unit test sums
them. A later surface is a marked placeholder until its ticket fills it, and keeps to the canvas size reserved for it (design/335's
on-screen size at 1280×720, times 1.5, up to a multiple of 8).

| Surface (id) | Moving | Still frame | Reserved canvas | Built |
|---|---|---|---|---|
| Oscilloscope (`oscilloscope`) | a waveform scrolling across the screen | the same waveform, at rest | 96×72 | built (#381) |
| Rack lights (`rack-lights`) | the lights blink in an irregular pattern | all lights steady | 88×200 | built (#381) |
| Soldering iron (`iron-wisp`) | a thin wisp rises and fades | no wisp | 16×48 | built (#381) |
| Fan (`fan`) | the blades turn | the blades stopped | 48×40 | built (#382) |
| Radio (`radio`) | the dial's glow sweeps and signal bars rise and fall | the dial at rest, bars low | 152×88 | built (#382) |
| Desk phone (`desk-phone`) | about once a minute the screen lights for a few seconds with an envelope icon, and no words | the screen dark | 160×104 | not yet (#383) |
| Clock (`clock`) | the hands tick at normal speed from a made-up time, not the visitor's; about every two to three minutes the second hand steps back one second, then carries on | the hands at the made-up time for `STILL_T` | 80×72 | not yet (#383) |
| Laptop (`laptop`) | types the lab notes one character at a time, scrolls, and starts again | the last screenful, fully typed | 136×112 | not yet (#384) |

Each surface ticket changes only its own row's last cell, to "built (#NNN)". None carries a word that reads as a live status
(`validateContent` covers their words), and the clock shows no real time, so it carries no live data.

The cost, and why it is accepted: the landscape overview draws about 12 frames a second for as long as the visitor
rests there, on a desktop. A phone held upright (portrait framing), where the battery matters most, gets the still
frame; a phone held sideways uses the landscape framing and redraws at about 12 frames a second too. If that cost turns
out too high, raise `REDRAW_MS` (the milliseconds between redraws, so a larger value redraws less often and costs less)
before removing the screens.
