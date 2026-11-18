# #335 design: proposed prop positions

Stills of the room with the new and moved props where I propose them, for Adham to pick from (ticket #368, spec #335).
Nothing here is baked: `src/assets/room.glb` and everything under `src/` are unchanged. The room in the stills is
`tools/room/build.py --preview --proposal`, lit as the bake would light it but with 32 samples and denoised, so the
dark parts are noisier and the baked room will differ a little.

Site axes, metres: x across (left wall -1.9, right wall +1.9), y up, +z toward the door (back wall z -1.9).
A desk top is y 0.76. `yaw` is the way a prop faces: 0 faces +z, 90 faces +x.

In the stills marked "(HUD)" the **red boxes are the HUD's** (`src/pin.ts`: the name block, the link row and the meter device
with its line) at that window size, and the **yellow labels** point at each prop the framing rule names. The plain
stills have neither. The stills are JPEGs made from the renders.

## The rule, and how it was checked

#335's framing rule (with "Decisions after the spec check"): at the landscape overview, at 16:9 and 16:10, the rack, desk phone, clock face,
laptop screen, oscilloscope screen, racket, radio, fan, the soldering iron's wisp and the whiteboard are in frame, clear of the HUD's
boxes and the meter device, and not hidden behind another prop.

`blender -b -P tools/room/build.py -- --preview <dir> --views check-1280x720,check-1440x900,check-1920x1080 --proposal all` checks it on the model.
For each prop it takes 5 to 7 points on its lit face (a centre and four corners, 1 cm in front), and for each of the 5 camera poses the
mouse parallax reaches (at rest and with the pointer at each corner: the maths of `reach` in `src/pins.ts`) it asks: is the point inside the
window, outside the HUD's boxes (6 px kept round them, as `PIN_CLEAR` does), and can a ray from the camera to it reach it without hitting
another prop. A prop passes when every point passes at all 5 poses. The HUD boxes are `src/pin.ts`'s at 1280x720, 1440x900 and
1920x1080 (the windows `flight.test.ts` uses; 16:9, 16:10, 16:9). The numbers are in `check-proposal.json` (the proposal) and `check-today.json` (today's room).

Today (`check-today.json`) two of the listed props fail: the whiteboard (its top-left corner is under the name block at 1280x720) and the radio
(5 of 25 points pass at 1280x720: something in front hides it, and at 16:10 its right end is also outside the window; I didn't identify what hides it). The proposal passes for every
prop the rule names, at all three windows (see the table), with these limits:

- **The Work TV and the desk meter** keep their places, and they leave the window when the camera is at the parallax's far corners
  (the Work glass's left corner by 3 px at 1280x720, the meter's bottom end by about 76 px). Today's room does the same: `flight.test.ts` checks them at rest only. I did not move them.
- **Pins** (shown from about 1380 px wide, so at 1440x900 and 1920x1080): the About pin's box touches the whiteboard's lower-left corner (by 5 x 8 px at rest at 1440x900, more
  when the pointer moves). A pin is not a HUD box, so the rule doesn't cover it; I'm telling you rather than moving the board.
- The window sizes checked are those three. Below 1280x720 and the phone's portrait overview aren't covered by the rule.

## The stills

Today:
- `today-overview-1280x720.jpg` (HUD): today's room at 1280x720. The whiteboard's top-left corner is under the name block; the football is on the shelf unit; the radio is at the right edge, mostly hidden.
- `today-overview-1440x900.jpg` (HUD): the same at 16:10.
- `today-phone-390x844.jpg`: today's portrait overview.

The proposal (defaults: desk phone on the left desk, laptop on the back desk, clock on the right wall):
- `proposal-overview-1280x720.jpg` (HUD), `proposal-overview-1280x720-plain.jpg`: the overview at 1280x720 with the props labelled, and without.
- `proposal-overview-1440x900.jpg` (HUD): 16:10.
- `proposal-overview-1920x1080.jpg` (HUD), `proposal-overview-1920x1080-plain.jpg`: 1920x1080.
- `proposal-phone-390x844.jpg`: the phone's portrait overview (see "Phone" below).
- `proposal-closeups.jpg`: each new or moved prop from 0.8 m, to judge the models (generic objects, ADR-0002: no name, logo or prop from a series).

One still per option, each at 1280x720 (HUD), the default's still being `proposal-overview-1280x720.jpg`:
- `option-clock-back-wall-1280x720.jpg`: the clock on the back wall, beside the whiteboard.
- `option-phone-back-1280x720.jpg`: the desk phone on the back desk, beside the laptop.
- `option-phone-bench-1280x720.jpg`: the desk phone on the workbench (hidden: shown to say why it's out).
- `option-laptop-left-1280x720.jpg`: the laptop on the left desk (partly hidden: shown to say why it's out).

## Proposed positions

All are in `POS` at the top of the proposal section of `tools/room/build.py` (`--pos '{"fan": [-1.0, -1.72]}'` tries another).

| Prop | Today | Proposed | In the check |
|---|---|---|---|
| Desk phone | none | left desk, centre (-1.30, 0.76, -0.04), yaw 40: a cream base 0.20 x 0.04 x 0.22 m, sloped keypad, a 7.5 x 3.5 cm display (dark), the handset along its left side | 35/35. 103 x 67 px at 1280x720 |
| Laptop, opened | closed, (-1.62, 0.77, -0.80), behind the old Work TV | back desk, centre (-0.60, 0.76, -1.40), yaw 8, lid at 105 degrees, screen 27 x 16.5 cm | 25/25. 90 x 71 px |
| Wall clock | none | right wall, face centre (1.90, 1.45, z 0.68), facing -x, face radius 0.09 m, case 0.105, hands at a made-up 10:09 | 25/25. 49 x 48 px |
| Tennis racket | none | floor, butt at (1.12, 0.02, 1.05), leaning toward the shelf unit's front-left post, face toward -x; 0.68 m long | 30/30. 67 x 85 px |
| Tube of balls | none | floor, (1.02, 0, 1.22), standing, 0.072 x 0.24 m, one ball out of the tube at (1.12, 0.033, 1.27) | 15/15 |
| Fan | desk (-1.00, 1.01, -1.72) | desk (-0.78, 1.01, -1.72) | 25/25 (today 25/25 too: see below) |
| Whiteboard | centre (0.68, 1.55), 0.62 x 0.45 m, with a baked sketch | centre (1.10, 1.43) on the back wall, 0.48 x 0.36 m, blank | 25/25 (today 19/25) |
| Radio | lower shelf of the shelf unit, (1.63, 0.89, 1.75) | the shelf unit's middle shelf, (1.63, 1.44, 1.09): the football's place | 25/25 (today 5/25) |
| Rack, oscilloscope, iron | unchanged | unchanged | 25/25 each; the rack is 55 x 129 px at 1280x720 |
| Football, tournament bracket, whiteboard sketch, the closed laptop | in the room | gone | |

Why these:
- **The whiteboard is smaller and further right and down.** At all three windows and at all 5 camera poses the back wall's free band is narrow:
  right of the name block (x px 444+ at the top) and left of the link row, above the Home lab TV. I searched board sizes from 0.45 x 0.36 to 0.62 x 0.45 m by projection: every one that passes sits at x 1.02 to 1.32 and no higher than y 1.5, and the ray test then showed that a 0.56 x 0.40 board at x 1.10 has a corner behind the Home lab TV. A 0.50 x 0.36 board at x 1.08 also passes; I took 0.48 x 0.36 at (1.10, 1.43) to leave room for the small back-wall clock. It is 38% smaller by area than today's.
- **The back wall can hold the whiteboard or a big clock, not both.** I tried five spots from x 1.6 to 1.7 and y 1.35 to 1.63, face radius 0.085 to 0.1 m, to the right of the board: each had a point out of the window at the top, under the link row, or behind the Home lab TV at one of the five camera poses. A face of 0.07 m radius fits left of the board (the back-wall option below); the right wall has room for 0.09 m.
- **The radio moves** because it can't be in frame at 16:10 where it is. The rule names it but the ticket listed only the fan and the whiteboard to move: this is a third move, and it's the one I'd most like you to look at. It sits where the football was, with the dial facing the room.
- **The fan** passes the ray check where it is (it is tucked against the Work TV's bezel edge, not behind it), so by my check it needn't move. I moved it 0.22 m so its blades clear the bezel by about 45 px. Keep it with `--pos '{"fan": [-1.0, -1.72]}'` if you'd rather change less.
- **The laptop** can't stay in place or go to the left desk (below).
- **The racket and balls** are on the floor by the shelf unit's front-left post. I first tried the right wall's gap beside the clock (butt at (1.80, 0.78)): 11 of the racket's 30 points and 8 of the tube's 15 were hidden behind a prop 0.4 to 0.6 m in front of them, which by its place is the shelf unit's front-left post. This spot passes.

## Choices for Adham

**1. The clock's wall.**
- Right wall (the default, `proposal-overview-1280x720.jpg`): 49 x 48 px at 1280x720, in the gap between the bench's pegboard and the shelf unit. It passes at all three windows. The case overlaps the pegboard's end by 2.5 cm.
- Back wall, beside the whiteboard (`option-clock-back-wall-1280x720.jpg`): centre (0.77, 1.40), face radius 0.07 m, 24 x 29 px. It passes too, but is half the size and a speck at 1280x720.
- Recommended: the right wall.

**2. The desk phone's desk.**
- Left desk (default): the nearest desk to the camera, so the largest, 103 x 67 px at 1280x720, 35/35. It sits on the papers; its lowest corner is 11 px above the top end of the desk meter's first tube at 1280x720 (the meter's box and the phone's click target must not touch: the click ticket has to check that, and I did not).
- Back desk, beside the laptop (`option-phone-back-1280x720.jpg`): centre (-0.22, 0.76, -1.64), yaw 10, 47 x 24 px at 1280x720. 30/35: the five that fail are one point on the phone's own far edge, hidden by the phone itself; the display is in sight. 24 px tall is under a 44 px target, so the target would have to be larger than the prop.
- Workbench, front right (`option-phone-bench-1280x720.jpg`): ruled out. It is hidden behind the oscilloscope from the overview camera (0/35).
- Recommended: the left desk.

**3. Where the laptop goes.**
- Back desk, between the Work TV and the About TV (default): 25/25, 90 x 71 px. It uses the clear stretch of desk where the cables and the board lie; they stay.
- Left desk, on the mouse mat (`option-laptop-left-1280x720.jpg`): 15/25. The screen's left half is behind the old Work TV (0.3 to 0.44 m in front of its points) and the mouse and mat would have to move. Ruled out.
- Left where the closed one is (not rendered): the spec check found it behind the old Work TV.
- Recommended: the back desk.

## Phone

`proposal-phone-390x844.jpg` is the portrait overview (`overviewPortrait` in `src/room-layout.json`, unchanged). The rule is for the landscape overview, so I did
not check it. In the still: the laptop is cut by the left edge, the desk phone, clock, racket and radio are out of frame, and the whiteboard is a sliver at the right edge (today
about nine tenths of it shows, `today-phone-390x844.jpg`) because I moved it right. The spec says the whiteboard is "always drawn, in both framings and at every stop", and
a phone's overview shows it large today. If you want it on the phone's overview the portrait pose has to move; I haven't tried a pose.

## Not changed, not checked

- **`room.glb` and the random stream.** `--proposal` is refused without `--preview`, and every proposal edit in `build.py` is behind `PROPOSAL is not None`. I checked that the bake path is
  unchanged by baking the committed `build.py` of `main` and this one at low quality (`--size 256 --light-size 128 --samples 4`): all three meshes have the same vertices in the same order,
  and `random.getstate()` and the object count (699) at the end of the props are identical. The files' bytes differ between any two runs, even of `main` against itself, so a byte comparison can't say. The real bake wasn't run.
- **The props mesh** has 17,850 vertices in Blender today and 21,002 with the proposal (+3,152, including the football's removal): the glTF mesh has 33,162 today, so about 39,000 against the 65,535 ceiling (an estimate: the ratio today).
- **Lighting.** The laptop's screen is lit like a TV and lights its desk; the others add no light. The surfaces that move at runtime (the desk phone's display, the clock's hands, the laptop's words) aren't drawn: the desk phone's display is dark, the clock is set at 10:09, and the laptop shows a flat green screen.
- **Click targets, parallax of the targets, and the 44 px rule** are for the click ticket. This README gives the props' on-screen size at 1280x720 (`extent:` entries in `check-proposal.json`), and nothing more.
- **Windows other than the three**, and the portrait overview.

## To reproduce

```
heavy blender -b -P tools/room/build.py -- --preview /tmp/shots --samples 32 --proposal all \
  --views overview-1280x720,overview-1440x900,overview-1920x1080,phone-390x844,close-desk_phone,close-laptop_screen,close-clock_face,close-racket,close-radio,close-whiteboard
heavy blender -b -P tools/room/build.py -- --preview /tmp/shots-b --samples 32 --proposal clock=back-wall --views overview-1280x720   # also phone=back, phone=bench, laptop=left
heavy blender -b -P tools/room/build.py -- --preview /tmp/today --samples 32 --views overview-1280x720,overview-1440x900,phone-390x844   # today's room
```

`check.json` and the `ROOM_CHECK` lines are written beside the stills (`--views` with a `check-WxH` view checks without rendering).
