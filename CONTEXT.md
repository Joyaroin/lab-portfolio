# Context

The language of this project: its terms, what each one means, and what it doesn't.

- **Lab**: the whole site. A 3D late-night home lab that hiring teams tour to learn what Adham does.
  Not a page with a 3D header: the room is the site.
- **Room**: the 3D scene itself, its models and baked lighting.
- **Station**: one of the three monitors on the tour, with its own place in the room, its reading and its pages (every station has at least one). Visitors see "Monitor 1 · Work", "Monitor 2 · Projects" and "Monitor 3 · About me"; the code says station, with ids `work`, `projects` and `about`. Work is on the CRT that was MediaSafe's, Projects on the bench TV, About me on the CRT that was Contact's. A TV's place in `crts` (`src/crts.ts`, from `src/room-layout.json`) is its station's place in the content module, so the two lists change together.
- **Tour**: visiting the stations by clicking and stepping. The site opens on the overview; the HUD's links, the
  **keys** on the meter bar, the arrow keys and Esc move the visitor, as does clicking a TV (see **TV click**), and
  the camera follows the visit. Right is `next()` and Left is `prev()`: they walk the **walk order** one page at a time,
  across the stations (at the overview Right goes to Work's first page and Left does nothing; after About me's last page
  Right goes to the overview; during a move they act on the step being moved to; a key with a modifier is ignored).
  Esc is `up()`: from a project page it goes to the Projects list, from anywhere else to the overview. While an image is open larger
  (see **Page image**) Esc only shuts it and goes nowhere: the Esc listener in `src/TourView.tsx` asks `larger.openId()` first. The meter bar's PREV and NEXT and the desk meter's click go
  through `prev()` and `next()` too. Nothing scrolls: the wheel never moves the camera (ADR 0005, spec #170).
- **Bench TV**: the TV on the workbench, once Order Tracker's, and now the Projects station: the second entry in `crts` (`projects` in `src/room-layout.json`), drawn like any station (title card, bezel layer, hover glow, click, text on the glass) with the plate "HALDEN HX-418". Its glass is the same 0.46 x 0.36 m as the others, so `squareStop` gives its desktop stop, and its portrait stop comes from its `camera`, `look` and `portrait` entries. The bake lights it like the other five CRTs: the emissive screen glass, the green LED and the green area light on its surroundings (nothing in `tools/room/build.py` switches a TV off any more).
- **Spare CRT**: one of the three CRTs that are no station: the old Work CRT, the Home lab CRT and the Software factory CRT (`spares` in `src/crts.ts`, `spares` in `src/room-layout.json`). It is baked lit, with no sticky note (`build.py` still draws a spare's note colour and drops it, so the random stream stays), and shows an ambient screen (its glass is that canvas texture, drawn into by the list in `src/ambient/surfaces.ts` and placed by `src/Phosphor.tsx`): no title card, no bezel layer, no hover glow and no click, so a click on one is a click on the room. It is in no list the tour reads. The Home lab spare keeps `keyboard: false`. `bakeOrder` in `src/room-layout.json` is the six TVs' ids in the order `tools/room/build.py` bakes them (old Work CRT, MediaSafe CRT, Home lab CRT, bench TV, Software factory CRT, Contact CRT), whatever order `crts` and `spares` list them in, so the random draws (note colours, keyboard tilts) don't move; `src/crts.test.ts` checks it.
- **Ambient surface**: a canvas texture on a plane over a baked prop, drawn by the room and decoration only (#280, #335, ADR 0007). The first three are the **ambient screens**: what a spare CRT shows, the git log on the old Work CRT, the lab traffic on the Home lab CRT and the security puzzle on the Software factory CRT. The eight later surfaces are the oscilloscope, rack lights, iron wisp, fan, radio, desk phone, clock and laptop: the first three are filled (#381: pure modules `oscilloscope.ts`, `rack-lights.ts` and `iron-wisp.ts` in `src/ambient/`, each a pure function of `t` behind its `draw`; the oscilloscope's waveform scrolls and rests at `STILL_T`, the rack's five lights blink irregularly and are all on at `STILL_T`, the wisp's puffs rise and fade and are none at `STILL_T`), the laptop is filled too (#384, see **Laptop**), and the other four are marked placeholders until #382 and #383 fill them. The room draws every surface's plane with alpha (`transparent`, no depth write), so a surface can leave pixels clear: the rack's lights and the wisp are transparent between their marks, and each of their draws clears its canvas first. All are one list, `ambientSurfaces` in `src/ambient/surfaces.ts` (pure): for each its id, its canvas size, its `draw(ctx, t)` (ms) and its plane, which for a spare CRT comes from `phosphorFrame` and for every other surface from its entry in `src/room-layout.json` by id (centre, yaw, size and tilt). `src/Phosphor.tsx` draws one mesh per list entry and names no surface. A placeholder has its id and its reserved canvas size, and is left out of the tick and the stop until filled. All the canvases together paint at most 600k px a tick (`BUDGET_PX`; a unit test sums the screens and the reserved sizes). A `draw` can return `false` to say its frame hasn't changed, and then its texture isn't uploaded that tick. The three screens: each is a pure drawing module in `src/ambient/` with a pure function behind it that gives what is drawn (`gitlogRows`, `trafficDots`, `puzzleFrame`), drawn into a 400×300 canvas context; the list adds the glass's scanlines and darker corners. `STILL_T` in `src/ambient/still.ts` is the one time every surface draws its still frame at (the newest commits at the top, the dots in place, "SECURE" solved), and the phase rule is that each surface's cycle shows its still frame at `STILL_T` (`cyclePosition`, `src/ambient/phase.ts`). The surfaces are not content, so ADR-0001's real-HTML rule does not cover them. They redraw about every 83 ms (`REDRAW_MS`) only while the visitor is at the overview, in the square (landscape) framing, with no flight and without reduced motion (`ambientRedraws`, `src/ambient/redraw.ts`; `createAmbientRedraw` is the one timer, started and stopped from `Phosphor` every frame and on a resize). The canvas keeps `frameloop="demand"`: each tick redraws the textures and asks for a frame. At a station, in a flight, in portrait and under reduced motion the timer is off, nothing draws, and each surface holds its still frame (every one is put back when the timer stops). So the landscape overview is the one place the room never goes idle. Their words are `ui.ambient` in `src/content.ts` and `validateContent` applies the live-status rule to them; the git log's lines come from `src/commits-saved.json` and are exempt from it.
- **TV click**: at the overview only, a station's TV (not a spare CRT) takes a click and flies the visitor to its station, and a hover glow shows which
  one (`clickable` in `src/clickable.ts`, `easeGlow` in `src/glow.ts`). At a station or in flight no TV is clickable and no
  glow shows. At a station, a click on the room goes back to the overview: any press on the room that is not on that
  station's own TV (its glass or bezel), and another TV counts as the room from there (`goesBack` in `src/back.ts`, heard by
  `src/RoomClick.tsx`). A press that moves more than 6 px is a drag and does nothing. The desk meter's click still means
  next, and the HUD, the menu, the meter bar and the station's text are controls, not the room. At the overview and in
  flight it never applies, and not through a reduced-motion fade either (the fade's second half already reads as the new
  station, so the rule is given `visit.moving()`). Resting the pointer on a lit TV also previews its station on the meter
  (see **Hover preview**): `TvTargets` tells the tour which TV the pointer is on, through the meter link's `tvHover`.
- **Prop click** (#386): the room's two clicks on props, the targets in `props` of `src/room-layout.json` (`kind: "target"`): the rack (`rack`) opens Projects / Home lab and the desk phone (`desk-phone-target`, the whole phone; its lit display `desk-phone` is only a surface, and it takes the click lit or dark) opens About me / Contact (`PAGE_TARGETS`, `src/page-targets.ts`). Each is an invisible plane over its prop, drawn by `src/TvTargets.tsx` beside the TVs'. **The gate** is `pageTargetsOn`: a landscape window at least 1280 px wide and 720 px tall; under it and on the portrait overview neither is clickable. Inside it each is at least 44 by 44 px and meets no station TV's target, the desk meter, a pin or the Start button's box (`startBox`, `src/pin.ts`), at every width from 1280 to 2560 px, at 16:9, 16:10, 4:3 and 21:9, and at each of `reach`'s five camera poses (`src/page-targets.test.ts`). They are for a pointer: the same pages are reached by the HUD's links and the pages' tabs. Like a TV, each is clickable only at the overview (`pageTargetGoes`: the gate, `clickable` and `visit.target() === 0`); at a station or in a flight a press on one is a press on the room (it carries no `userData.press` tag) and goes back, with no change to `src/back.ts`. The Home lab spare CRT on the rack stays room (ADR-0007). **Hover (#387):** while the pointer rests on one where it takes a click (`pageTargetGoes`), the cursor is a pointer and the line under the meter changes at once to where it goes, the words in `ui.propHover` in `src/content.ts` ("Home lab", "Contact"; they join `lineTexts`, so the line's height is still the gap's sentence). The digits don't change and there is no glow; touch and focus get no preview. `TvTargets` reports the prop's id through the meter link's `tvHover` (a station's number for a TV, a string for a prop), and `createHover`'s `point("prop", id)` makes a preview with no `stop` (see **Hover preview**).
- **Room prop**: an entry of `props` in `src/room-layout.json` (read through `props` in `src/crts.ts`): a surface drawn on a prop (`kind: "surface"`, with #378's ids), the whiteboard (`"board"`), a click target (`"target"`: exactly two, `rack` and `desk-phone-target`, the box over the whole desk phone, base and handset, which #386 places its 44 px target from; `desk-phone` is only the phone's display) or a prop framed with no click (`"prop"`: the racket, the tube of balls), each with a centre, a yaw, a size and, if its face leans, a tilt. They are the one place a plane, a drawn board or a target is placed from, and no later ticket edits them (#379), but one: #386's follow-up round (Adham, 2026-11-18) enlarged `desk-phone-target` to 0.22 x 0.30 m, 127 x 76 px at 1280 x 720 at rest, so that it covers the baked handset's raised ends to within 6 px (9 px at 1920 x 1080), 2.6 px from the desk meter's box at 1280 x 720 (the limit on its size). `src/visit/room-props.test.ts` sweeps the overview's framing rule over them: each is inside the window and clear of the HUD's boxes (the name block, the link row, the meter device and the line under it, 6 px kept round them) at the landscape overview, at every width from 1280 to 2560 px in steps of 8, at 16:9 and 16:10, and at each of the mouse parallax's five camera poses (`reach`). One named exception, Adham's (2026-11-18): at 16:10, 1280 to 1303 px wide, with the pointer at the window's top left, the whiteboard may meet the name block. `tools/room/build.py` reads the entries of every new and moved prop (#380) and turns each lit face back into the script's own input (the radio's depth 0.14, the laptop's hinge, the racket's butt 0.32 back along the shaft, the tube's radius 0.036: those constants live only in the script), so a prop and the surface drawn over it can't fall out of step; the oscilloscope, rack, rack-lights and iron-wisp entries equal where the script puts those props. `src/visit/room-sight.test.ts` raycasts the committed `src/assets/room.glb` from the overview camera, at rest and at each of `reach`'s five poses, to each prop's face (the middle and four corners, 1 cm in front) and fails if another prop is in the way; the `rack` target (its lower part is behind the desk) and `desk-phone-target` (it encloses the phone) are left out, tested by `rack-lights` and `desk-phone`.
- **Whiteboard** (placeholder: #385 fills this line in; #384 fills the lab notes): the board on the back wall, baked blank (0.48 x 0.36 m at x 1.10, y 1.43; the `whiteboard` entry in `props`, `kind: "board"`), with nothing on it until a later ticket draws its words at runtime. Its words are `ui.whiteboard` in `src/content.ts`.
- **Desk phone**: the cream phone on the left desk, baked with its display dark (#380): a base 0.20 x 0.22 m with a sloped keypad and the handset along its left side. A generic object (ADR 0002). Its display is the `desk-phone` surface in `props`; the box over the whole phone is the `desk-phone-target` click target.
- **Laptop**: the opened laptop on the back desk between the Work TV and the About TV (#380), baked with its screen a flat green and its words left to a surface (the `laptop` entry; the lid stands at 105 degrees). The closed laptop that lay behind the old Work CRT is gone. Its screen is the `laptop` surface (#384, `src/ambient/laptop.ts`): it types the lab notes one character at a time (a character every `CHAR_MS` = 70 ms, a pause after each line), eight rows of 30 characters, scrolls a row at a time once the screen is full, holds the finished screen for six seconds and starts again; its still frame, `STILL_T`, is the last screenful fully typed, in the middle of that hold. The words are texture (a few pixels tall at the overview, not meant to be read, but true): `laptopCommand` ("$ cat lab-notes.txt") and `labNote01` to `labNote11` in `ui.ambient` in `src/content.ts`, the notes approved by Adham on 2026-11-17 (#335), written once from core-infra's commit history (nothing reads core-infra at build time), so `validateContent` applies the private-address and live-status checks to them. Its plane is the `laptop` entry stood 2 mm in front of the baked screen (`lifted` in `src/ambient/surfaces.ts`), so the two don't z-fight.
- **Wall clock**: the round clock on the right wall (#380), face and case baked, hands set at a made-up 10:09 until a surface draws them (the `clock` entry is the face, 0.18 m across).
- **Racket**: the tennis racket leaning on the shelf unit's front-left post (#380), framing only, no click (the `racket` entry).
- **Tube of balls**: the tube standing on the floor beside the racket, with one ball out of it (#380), framing only, no click (the `ball-tube` entry).
- **Removed props**: the football on the shelf unit, the tournament bracket on the back wall, the whiteboard's baked sketch and the closed laptop, all taken out in the re-bake (#380). The radio, the fan and the whiteboard moved (the radio to the shelf unit's middle shelf, where the football was).
- **Hover preview**: at the overview, resting the pointer on a lit TV, on a station's pin or on a station's HUD link makes the meter show
  that station before the click. The bar's line changes at once to the station's name only ("Projects",
  no count); after the pointer has rested `PREVIEW_REST_MS` (150 ms) the digits play the short scramble
  (`SHIFT_SECONDS.short`, 0.25 s) onto the station's reading, or change with no scramble under reduced motion. Leaving,
  or moving to another station before the 150 ms (which starts the rest again), puts the gap's line and digits back at
  once with no animation. A visit ends the pointer's claim on a HUD link (it has not moved since), so back at the overview a
  pointer left on the link clicked shows no preview until it enters a link again; a pointer left on a TV starts its rest again
  on the landing. It is pointer only: keyboard focus never previews (the tour puts focus back on a HUD link
  whenever the visitor returns to the overview), touch has no preview, and it never applies at a station or in a flight.
  It is not a shift: the room never tears for it. The rule is in `src/bar.ts`: `createHover` (which station the pointer
  is on, from the TV, the pin and the HUD link, or which of the rack and the desk phone it is on (#387: its preview has no `stop`, so only the line changes, from `previewLine`), each reporting its own enter and leave; `lit` and `pinStop` say which TV and pin glow: a link previews but lights neither), `previewStop` (only at the overview) and
  `meterDigits` (below). The tour feeds it and passes the result to the bar through the `reading`, `label` and `shift`
  props, so the bar is not edited for it.
- **Overview**: stop 0. A camera pose that shows the glass of the three station TVs (the bench TV included) and the whole desk meter on a
  landscape window at 16:9 and 16:10, with none of them under the HUD's name block, link row or the meter device
  (the boxes in `src/pin.ts`). The spare CRTs are not checked. It has its own wider field of
  view (`OVERVIEW` in `src/crts.ts`, 75 degrees at most; stations use `CAMERA_FOV`), and a separate pose for a
  portrait window. `src/visit/flight.test.ts` projects the TVs and the meter through the real camera to check this; if the
  HUD's boxes in `src/pin.ts` change, the pose may need to change with them. It is where the site opens and where Back goes from the HUD's Overview link and the ROOM key, and Esc too except from a
  project page, where it goes to the Projects list (`up` in `src/walk.ts`). The meter shows the gap there. It is not a station.
  On a landscape window it carries a numbered **pin** over each station's glass ("1 Work", "2 Projects", "3 About me", `ui.pins`): a
  link that visits its station, after the HUD's links in the tab order, in tour order. The rule is in `src/pins.ts` (`pinPlaces`),
  a pure function of the camera and the window: all three pins or none, none when any pin would meet the HUD's boxes (`src/pin.ts`) or the meter
  device, leave the window or touch another pin, at the camera's rest or anywhere the mouse parallax takes it (so with today's pose pins show
  from about 1380 px wide up, at 1440 x 900 and 1920 x 1080, and not under the two-line or compact HUD or on a portrait window).
  `PinPlacer` (in the room's canvas) puts each pin over its glass every frame; they hide in a flight and at a station, and show without easing
  under reduced motion. Hovering a pin lights its TV's glow (the meter link's `pinHover`), and hovering the TV lights the pin.
- **Visit**: where the visitor is and is going: a stop (the overview or a station) and, at a station, the page. `src/visit/`
  owns both. `visit.step()` is the stop and page (a `Step` from `src/walk.ts`) the visitor is at or going to; `visit.target()` is just its stop.
  `next()`, `prev()` and `up()` follow the walk order. A move to another stop flies (or fades) and emits `move` then `land`;
  a move to another page of the same station emits `page` and nothing else: no flight, no fade, no scramble. A page
  press during a flight changes the page the flight lands on; during a reduced-motion fade it waits like any press.
  `go(stop)` opens a station's first page, `go(step)` a given page, and `go` to the stop the visitor is on keeps its page.
- **Cover**: the dark layer over the room that hides the cut of a reduced-motion fade. It rises at once but falls no faster
  than `COVER_MAX_FALL_PER_SEC` (`nextCover` in `src/visit/cover.ts`), so it never snaps off.
- **Flight**: the camera's move from where it is to a station (or to the overview): one smooth curve of
  0.9 s (`FLIGHT_MS`) that passes no other station (`flightPose` in `src/visit/flight.ts`). A move started mid-flight starts
  from where the camera really is. Under reduced motion a move is a quick fade, out, cut, in, about 300 ms, with
  no tear. A press during a fade waits until the fade ends, and the latest waiting press wins: it replaces any
  earlier one, and one for the place just reached (stop and page) does nothing. A waiting press for another page of the
  station just reached is a page move on landing. `visit.step()` is the stop and page the last press asked for.
- **History**: the browser's history tracks the step (stop and page) the URL shows (`linkHistory` in `src/visit/history.ts`): a move
  to another stop pushes an entry, a move to another page of the same station replaces the current entry (so Back goes to
  the previous monitor or the overview, not through every page), a Back or Forward press moves the visit (stop and
  page), and wherever the visitor lands that the URL doesn't show (a press that waited, or one dropped), the URL is
  corrected the same way. URLs are hashes (`src/visit/route.ts`): a station's first page is `#work`, `#projects`,
  `#about`, and a later page `#work/barracuda`, `#projects/software-factory`, `#projects/mediasafe`,
  `#projects/home-lab`, `#about/off-the-keyboard`, `#about/contact` (`stepForHash`, `hashForStep`). Old links map to their new place:
  `#mediasafe`, `#home-lab`, `#software-factory` to `#projects/...`, `#contact` to `#about/contact`. Opening a direct link, old or
  new, lands there with no flight and no shift, replaces with `./` and pushes the (new) hash, so Back goes to the overview.
  An unknown hash opens the overview and touches no history.
  The tab title follows the same step (`titleForStep`): "Solace · Work · Adham Sedik" on a named page, "Projects · Adham Sedik"
  on the Projects list (the page with a `list`), the page title at the overview, set after each history call so every entry keeps its own title.
- **Title card**: the big label on the glass of a station's TV you aren't at: its number over its name
  ("1" over "Work"), readable from across the room: as big as the glass allows, wrapped onto two lines at a
  space when that makes it larger. The name comes from the
  station's `name` in the content module, and the number is the station's place in the tour. It clears when that station's
  text is on its glass, which happens only in the Square framing (`textOnGlass`); on a portrait window
  the text is pinned beside the CRT and the card stays. It never moves and never reads as a live status
  or result.
- **Bezel**: the frame round a TV's glass. The baked one is soft up close, so a sharp layer is drawn over
  it: a crisp edge, a maker's plate and a sticky note. Its words come from the station's `bezel` in the
  content module, and none of it reads as a live status or result.
- **Maker's plate**: the small metal label on a bezel's bottom left, with a made-up model number such as
  "HALDEN HX-101". One per TV.
- **Sticky note**: the small coloured note at a bezel's top left, with a few words of its own and a tilt
  that differs on each TV, pinned to its station by id (`noteStyleFor` in `src/notes.ts`).
- **Diagram**: a page's line drawing on its glass. It redraws facts already in that page's copy
  and adds none, and never reads as a live status or result. Only the three project pages (Software factory,
  MediaSafe and Home lab) have one, and they are a left-to-right chain of steps joined by hops.
- **Page**: one part of a station's text, shown one at a time. Every station has at least one. A page has a
  lead (a page may have none), up to three bullets (none is allowed), and its diagram and links (a page with no links draws no links row, so its text moves up by the row's margin: Why I do this and Off the keyboard. A row that is drawn is marked `data-links`). Work has
  two (Solace and Barracuda, the only pages with dates and months), Projects four (the list, then Software
  factory, MediaSafe and Home lab) and About me three (Why I do this, Off the keyboard, Contact). A project
  page has one stat line, which is the one statement of that fact on the page (no bullet repeats it; this reverses #280's rule that it repeated a fact the copy already stated), and the list page has a `list`: a prompt, a row for each project with its tag and its
  stat, and a foot. A station may have a `line` under its heading (Work's, About me's). Where a station keeps a
  whole text (Work's `body`), its pages hold exactly that text, in order; the other stations keep theirs on their
  pages only. The glass shows the visit's current page (`ScreenPanels`
  takes the visit and its step, and keeps no page of its own): a station not being visited keeps showing the page it last showed, so a panel fading out
  never changes its text, and one nobody has visited shows its first page. Every panel opens with its breadcrumb ("Monitor 1 · Work"; on a project page
  "~/projects / mediasafe", where "~/projects" is a link to the list), then its heading (a project page is headed by the project's name). Work and
  About me show their pages as **tabs**, in page order, the open one filled and marked `aria-current`, with a job's dates under its name. Projects shows its list
  page as rows (each a button that opens its project), and every page after the list as a project page. At the foot of every panel, kept on the glass while
  the text scrolls, a **Back** button ("← Solace", "← All projects") and a **Next** button that names where it goes ("Next job: Barracuda →", "Next: Projects →",
  "Next project: MediaSafe →", "Next: About me →", "Next: Contact →", "Back to overview" on the last page of About me). Back shows only when the page before
  is in the same station, and the Projects list has no Next (its foot says to pick a project). They, the tabs, the rows and the breadcrumb's link
  call the visit (`go`, `next`, `prev`), so the URL and history follow (a page change replaces the entry), and the buttons go exactly where → and ← go.
  What each says and where it goes is one pure function, `controlsFor` in `src/text/controls.ts`; the words are `ui.pageControls`. After a tab, a row, the
  breadcrumb's link or a button, focus moves to the new page's heading (`tabindex="-1"`); the arrow keys move no focus. A page change plays the **shift**'s
  short flick on that station's glass (see Shift), at every station, and swaps the text at once under reduced motion. Scrolling never changes the page and a new
  page starts at its top. The **walk order** (`src/walk.ts`)
  puts every page in one sequence after the overview, and `up` goes back up (a station with
  `upToFirstPage` goes from a later page to its first page, otherwise to the overview). The visit holds the page and moves it with `next`, `prev` and `up`.
- **Step**: one box in a diagram, such as "Argo CD".
- **Hop**: the arrow between two steps, with an optional label such as "by hand". A diagram has one fewer
  hop than steps.
- **Page image**: a page's optional picture (`Page.image` in `src/content.ts`): a file name, its alt text, an optional caption, where it sits
  (`top`, beside the page's heading, lead and stat line, or `below` the bullets) and whether it opens larger. The content module holds only those
  words and the file's name, never an import, because the build imports that module to write the page: `ScreenPanels.tsx` turns the name into the
  file in `src/assets/`. `validateContent` checks the alt text and the caption like other text and rejects an image with no alt text; it can't check
  that the file exists. Today three pages have one: the About me portrait, on that station's first page, the MediaSafe project page's Library screenshot (`mediasafe-library.jpg`, cropped to the first three titles of the Library's first row), both at `top`, and Off the keyboard's golf day photo (`golf-day.jpg`, the Solace team, with the caption "Team golf day at Solace."), at `below`. It is shown green through its greyscale
  file with scanlines (`theme.css`'s #287 block). It is mounted only once its page has been shown (`imageMounted` in `src/text/image.ts`), so nothing
  is fetched at boot, and left out on a short landscape window. A file that fails to load shows nothing, no broken image and no empty frame. An image
  that loads or fails after its page is shown changes the panel's height, and the room draws only on demand, so the panel works out its "more" cue
  again then. **On a project page** (a page with an image at `top` and a stat line: `imageBesideText` in `src/text/image.ts`) the image sits at the right of the panel's top row, 9.5em wide, and the page's heading, lead and stat line are in the column to its left (the lead and stat are drawn lower on a page without an image, and on the About me portrait's page); in the portrait framing it comes after the bullets, so it pushes no text down, and on a short landscape window it is left out. Each image's own width and height are next to its file's import in `src/text/ScreenPanels.tsx` (`IMAGE_FILES`), so its box has the file's shape before it loads. **Below the bullets** (`place: "below"`, Off the keyboard's golf day photo): the image sits under the bullets with its **caption** under it, both centred, green with scanlines like the others, 8.5em wide at most, 14em in the portrait framing (`theme.css`'s #342 block). It does not open larger, and is not beside any text. In the portrait framing it also comes after the bullets; on a short landscape window it is left out, and its caption with it, as is a file that fails to load. Off the keyboard shows no "more" cue at 1280×720, 1440×900 and 1920×1080 with its two bullets, the Last watched line holding the longest title the read accepts, the photo and its caption (`tests/fold.spec.ts`, which serves that answer). **A caption is page text**: `src/page-html.ts` writes it into the pre-boot HTML with the page's bullets (ADR-0001); the image is not written there. **Opening larger** (#344): an image whose content says `larger: true` (the MediaSafe screenshot; not the portrait) is drawn inside a real button named "Show the screenshot larger" (`ui.imageLarger.open`); a click, Enter or Space opens it in a dialog named by the image's alt text, as large as the panel's visible area allows (`fitWithin` in `src/text/larger.ts`, drawn by `src/text/LargeImage.tsx`, portalled into the panel so it is on the glass, with the panel's scrolling stopped meanwhile). Focus goes to its "Close" button (`ui.imageLarger.close`) and Tab stays on it. Esc, Close or a click on the image shuts it and focus goes back to the button that opened it (`larger.close()`). Any move of the tour (an arrow key, a meter key, a tab, a Next or Back button, a HUD link, the browser's Back or Forward) shuts it with no focus change and then moves (`larger.drop()`, called from the visit's subscription in `src/TourView.tsx`). It opens and shuts at once, with no animation for anyone. Which image is open is the one store in `src/text/larger.ts`, so the tour's Esc listener can hear of it. The open image is part of the station's text, a DOM element over the room: a click on it never reaches the room, so it is never a press for `goesBack` (`src/back.ts`), and `tests/image-larger.spec.ts` checks it. A file that failed to load has no button.
- **Meter**: the nixie tube display at the centre of the site. It is our own design, and it is both
  navigation and a live readout.
- **Reading**: the number the meter shows. Each station has a fixed reading; the overview shows the gap, with its sentence in the long form ("MediaSafe: 9 staging deploys since the last prod release") or, on a short landscape window, the short form (see Meter bar).
- **Last watched line**: the line "Last watched: {title}" inside Off the keyboard's watching bullet (#336, ADR 0008): the title Adham last watched
  in MediaSafe, read live from a MediaSafe share link by the visitor's browser (`readLastWatched` in `src/last-watched.ts`: a 200 as `text/plain`,
  at most 512 bytes (`LAST_WATCHED_MAX_BYTES`), with no redirect followed, whose trimmed body is 1 to `LAST_WATCHED_MAX` (80) Unicode code points with no control, line-break or invisible formatting character; anything else, a failed call or no answer in 5 s
  is "show nothing"). It is hidden, never saved, when the read fails. Not a **reading** (the number the meter shows) and not a station's "line"
  (the line under its heading). It is the one text that may look like live data on a TV (ADR 0007). It is on the page through `Page.lastWatched`
  (`{ bullet, words }`: the index of the bullet it sits inside and the words, with `{title}`), shown as text under that bullet's sentence in the golf
  caption's colour and size, on one line cut with an ellipsis. The read starts the first time that page is shown (at boot on a direct link to it),
  once per page load, from a store outside the panels (`src/text/last-watched-store.ts`); the link is `LAST_WATCHED_URL` in `src/last-watched.ts`.
  It is not in the pre-boot HTML. No space is held for it: when the answer lands (up to 5 s after the page is shown) the photo below moves down a line and the panel works out the "more" cue again, as it does when the golf photo loads (#370).
- **Desk meter**: the meter as built in the room: seven nixie tubes on the desk, drawn live. Clicking it means
  next. It is a display in the room only: the meter bar's digits do not depend on whether it is in frame. Its digits
  and scramble come from `meterDigits` in `src/bar.ts`, the one function the bar reads too, so through a hover preview
  the two show the same digits and the same scramble; outside a preview it shows the reading at the visitor's place
  (rolling between two stops in a flight, where the bar shows the stop flown to) and the shift that is playing. The tour
  gives it the gap and the preview through the meter link (`deploys`, `preview`).
- **Meter bar**: the bar under the room, drawn as the **device**: the meter layers put together (below) at the size
  `deviceSize(win)` in `src/pin.ts` gives (420 px wide at 1920 x 1080, 417.6 at 1440 x 900, 280 on a phone), with the
  reading's digits as lit numerals over the tubes, the keys over their drawn keys, and the line under it (its height is `lineHeight(win)` in `src/pin.ts`, part of the bottom clearance, and the bottom clearance's `hudTier` test uses it too). The line is 14.4 px type, 12.8 px on a portrait window and on a short landscape window (the compact HUD). On a compact window its box may run wider than the device, up to the HUD's side margins (`HUD_MARGIN`; `lineMaxWidth(win)`), and it shows the **short form** of the gap sentence (`ui.gapBehindShort`, `ui.gapBehindAtLeastShort`: "MediaSafe: 9 deploys ahead of prod", "MediaSafe: 9+ deploys ahead of prod"; `gapLabel(gap, true)` in `src/gap.ts`, chosen by `isCompact(win)`), so the line is always one line there, from 560 px wide up (the saved form, `ui.gapSaved` around it, is 60 characters at a count of 100). The height is worked out from the real longest text of the form the window shows, at a count of 100 (what `countGap` returns at most and the save script stores; `lineTexts` in `src/pin.ts`). Elsewhere the box is at most the window less 1 rem. The line is the
  gap's sentence at the overview and, at a station, the page's line (`stopLineFor` in `src/bar.ts`, from `stopLineText` in the content module): `ui.stopLine`,
  "Monitor {n} of {total} · {station} · {page}" ("Monitor 1 of 3 · Work · Solace", "Monitor 2 of 3 · Projects · MediaSafe"), or `ui.listStopLine`, "Monitor 2 of 3 · Projects", on the Projects list (one form in every framing, 44 characters at most);
  `n` is the station's number and the total the number of stations. A move inside a station changes the line but not the reading and plays no scramble. `lineTexts` includes every page's line. The bar itself takes no click: only the keys do. In a flight
  it shows the stop being flown to (keys, line and digits). What it shows is one pure rule, `barFor(where, framing)` in
  `src/bar.ts`; `deviceLayers` in `src/meter-device.ts` maps a reading and the keys to the layers shown (a digit change
  changes one tube's image); `src/Meter.tsx` draws it. The device plays the power-on, as
  the desk meter does (`powerOn` in `src/nixie.ts`): as the boot screen goes, its tubes come up from dark. One number, the
  power-on's glow, is the opacity of the tubes' light layer, of the numerals and the dot, and of the drawn keys (the keys
  carry the tubes' light, so they come up with the tubes, and the device starts dark); the numerals flicker and settle left
  to right. `src/meter-power.ts` holds the rule and its frame loop, on the page's clock from `MeterLink.onMs`, when the boot
  screen began to go. Under reduced motion the device is lit at once. A device whose images arrive after the power-on, or
  while the plain version showed because they failed, appears lit and does not play it again; one that arrives part way joins
  where the clock is. The shift waits for the power-on as before. The images
  are files of their own, asked for while the boot screen is up (`src/meter-images.ts`); until they arrive, and for good
  if they fail, the bar is plain text digits and plain buttons. At the overview, a pointer resting on a TV or a station link changes the line, then the digits (see **Hover preview**); `meterDigits` in `src/bar.ts` gives the bar's digits and scramble.
- **Keys**: the buttons on the meter bar, with their words in `ui` (`keyPrev`, `keyRoom`, `keyNext`, `keyStart`) and
  their accessible names (`prevStation` "Previous page", `backToRoom` "Back to the overview", `nextStation` "Next page", `startTour` "Start the tour"; the key names keep their code names, only the words changed), each at least 44 x 44 px. On the device each is a transparent button over its drawn key (the drawn key already has the word, so the button's text is not painted); it brightens on hover and focus and shows a press, in CSS. At a
  station on a landscape window they are PREV, ROOM, NEXT; on a portrait window PREV and NEXT (the phone bar has the
  way back to the overview); at the overview START alone. PREV is `visit.prev()` (one page back along the walk order; Work's first page goes to the overview),
  NEXT is `visit.next()` (one page on; About me's last page goes to the overview), ROOM is `back()`, START goes to Work.
- **Meter layers**: the rendered images the meter bar's device is built from (ADR-0006): the case and tubes unlit, the
  tubes' light on the case, ten lit numerals all seven tubes share, the decimal point and the four keys (PREV, ROOM,
  NEXT, START), each with a clear background. `make meter` renders them from `tools/meter/` into `src/assets/meter/`, and
  `src/meter-layers.ts` lists each one's place and size on the 840 px wide device and how it is laid over the base.
  The key words come from `ui` in the content module, so changing one means rendering again.
- **Gap**: how many MediaSafe staging deploys have landed since the last promotion to prod. Real
  data, not decoration, and the meter says so when it's showing the saved value instead. Not config
  drift, which Argo CD keeps at zero.
- **Boot screen**: the instant lightweight first screen with Adham's name, title and real load progress.
- **Signal lost**: the one static screen shown when 3D can't start. Not a second site.
- **HUD**: the always-on overlay: a name block (name, title, availability: the graduation date only, "Graduating Dec 2027."), the Overview link (`ui.room`) that goes back to the overview, the
  station links (Work, Projects, About me) and the outside links (Résumé, LinkedIn, GitHub, which open a new tab and carry a ↗). On a landscape window
  at least `ONE_ROW_MIN_W` (1060 px) wide the name block is at the top left and one row of links at the top right: Overview and the
  stations, a divider, the outside links. Narrower, the row moves to its own line under the name block, and under
  `TWO_LINE_MIN_W` (616 px: the link row's box, `LINK_ROW_W`, plus both margins) it wraps as two whole groups (stations, then outside
  links), a third line. `LINK_ROW_W` (580 px) is the row's real width on one line, 571.64 px as Chromium measured it on the Mac at 14 px, with a little room for a wider
  font; with three stations the row holds one line down to about 608 px, so between 616 and 836 px the HUD is two lines and reserves no third. No row holds
  a single link, and each group holds down to its own width plus both margins (the stations, about 335 px; narrower, the groups overflow rather than split, though a landscape window that narrow is always compact).
  **Résumé is a button** (an amber outline, `resumeIsButton` in `src/pin.ts`) on every tier but the compact HUD, where it stays a link: the button is
  as tall as a link, so no line and not the phone top (96 px) grows, but it is wider, and the compact first line has only `COMPACT_SLACK` to spare. On a short landscape window (a phone held sideways) the HUD
  goes **compact**: no availability line, 14 px text. From `COMPACT_MIN_W` (655 px wide) two lines: the name, the title and the
  outside links, then Overview and the stations; narrower, three: the name and title, the outside links, the stops. A window is
  short when its width's tier would leave the panel under `MIN_PANEL_H` (120 px): `height < tier top + 120 + bottom clearance` (the bottom as the full HUD has it)
  (`hudTier(win)` in `src/pin.ts`, a pure rule of the window): about 461 px under 616 wide (three lines, and the full HUD's saved gap sentence, 82 characters, wraps to two lines), 425 at 616 to 746, 407 at 747 to 967, about 419 at
  1059 (two lines), then 383 at 1060 (the one-row HUD) and about 410 at 1279. The compact tops are 76 px (two lines) and 107 px (three), from `COMPACT_LINE_H` and `COMPACT_GAP`; with them the glass and
  the panel keep `MIN_PANEL_H` on a short landscape window at least 236 px (267 px under 655 wide) plus the meter device's height tall, the device being the one part that grows with
  width (`deviceSize`: 0.29 x width wide, 280 to 420 px, so 118.8 to 178.2 px tall): 385.8 px under 655 wide, 354.8 px from 655 to 965, 236 + 0.123 x width from 966 to 1447 (359 at 1000, 393.5 at 1280) and 414.2 px from 1448 up.
  Shorter than that no HUD leaves the room and the panel is held at 120 px and reaches the meter (1280x380 has 106.5 px, 2000x400 105.8 px). On a portrait window the
  name block spans the top with the name, title and outside links (no availability line, Résumé a button), and Overview and the stations are the
  **phone bar**, one row of four buttons along the bottom, each at least 44 px tall (`PHONE_ROWS` is 1, so the bar is 56.8 px); the text panel stays above the meter bar, which rises above the bar,
  and has the room the second row gave up. All HUD text is at least 14 px.
  The current stop's link differs in weight and background as well as in `aria-current`; during a flight none is marked. The
  name block fits `NAME_BLOCK_W`, the link row `LINK_ROW_W` x `LINK_ROW_H`, and the HUD is no taller than the top
  clearance (`clearances(win).top`, all in `src/pin.ts`): on landscape the one-row HUD's height (90 px), the
  two-line HUD's (126 px) from `TWO_LINE_MIN_W`, the three-line HUD's (162 px) under it, or the compact HUD's, each worked out from the boxes.
  The **Start button** ("Start the tour · 3 monitors", with "or click a monitor" under it, or "or pick one below" on a portrait window; the words are `ui.hud`)
  stands 8 px above the bottom clearance on the overview. It takes the hint line's place: it fades after the first landing at a station, leaves the tab order at
  once, and stays gone. It does what the START key does, `visit.go(1)`.
- **Phone stop**: a station's own camera stop, look point and text pin used on a portrait window instead of
  the pulled-back view, where that view would be mostly dark. Only Work (the CRT that was MediaSafe's) has one.
- **Framing**: how the camera and the text are set for the window's shape. Two exist. **Square** (a window
  at least as wide as tall): each station's own square stop, worked out from the window; the text is laid
  over the glass; no mouse parallax at a station. **Portrait** (taller than wide): the pull-back, or the phone
  stop where a station has one; the text pinned beside the CRT; full parallax. Chosen from the current
  window each time, so rotating or resizing switches it. In code: `framingFor(window)` in `src/framing`. On a short landscape window the text panel and glass keep at least `MIN_PANEL_H` between the HUD and the meter bar, when the window is at least 236 px (267 px under 655 px wide) plus the meter device's height tall: 385.8 px under 655 px wide, 354.8 px from 655 to 965, 236 + 0.123 x width from 966 to 1447 and 414.2 px from 1448 up. The compact HUD tiers and the one-line (short) text under the device are all the room that can be made, so below that height the panel is held at the floor. `src/pin.test.ts` sweeps the short landscape windows from 560 to 3840 px wide against that formula.
- **Where**: where the visitor is, as a value: at a stop (0 is the overview, 1..n a station), or flying from one stop
  to another with `f`, the share of the flight done. `visit.where(now)` gives it; the framing and the text's
  strength take it.
- **Shift**: the moment of arrival at a station, when the view tears and the meter scrambles and locks
  onto the reading. It fires as the camera lands, with no wait (once the power-on hold is over), not when flying through. Full on
  a station's first visit, a short flick after. Never at the overview, never with reduced motion. There is no restore window: a reload followed by a click plays the shift. The
  tear is room-only: the HUD and the meter bar stay still. A page change at a station (a tab, a row, a button, a key or the browser's Back, on any station) plays the short flick too, on
  that station's glass only (not the room); the same limit counts it, so holding → across a page and a monitor boundary stays inside it. On a return the text shows on
  the landing and the flick plays over it; on a first visit it waits for the tear, then resolves out of
  it. The full tear lasts 0.4 s and re-cuts its bands once; the short flick lasts 0.25 s. No one-second window holds more than 3 sudden changes (the
  tear starting, a re-cut, the snap back), the snap back counted where it is visible (the slip reaches 0, at
  0.85 of the tear's length: 340 ms of a full tear, 212.5 ms of a short one, `snapBackMs` in `src/tear.ts`),
  not where the tear's length ends; the text still waits for the full length plus `SNAP_BACK_MS`. Counted
  over a little more than a second to cover late frames; a shift held back by that still shows its text.
  Visits are kept in memory only, and nothing on screen shows where you have been.

## Modules

Where the code for each concept lives. Tests sit beside their code. Only modules that have been deepened
get a folder; the rest are still flat files in `src/`.

- **`src/visit/`**: the visit. `createVisit({ reduced })` makes the one visit object; the app creates it and gives it to
  the room and the tour. `go(stop | step)`, `back()`, `next()`, `prev()` and `up()` start a flight from wherever the camera is, mid-flight
  included, when they change the stop, and just move the page (a `page` event) when they don't; `land(stop | step)` puts the visitor there with no flight. `step()` reads the stop and page. `where(nowMs)`, `fade(nowMs)` and `moving(nowMs)` (a flight or a fade is running) read it, and
  `launch(nowMs)` gives where the current flight began (a chain of re-targets), which `framing.cameraAt` resolves with
  `flightPose`. The visit has no timer: the room's per-frame read (`CameraRig`) is what notices a landing and fires
  `land`. `flight.ts` is the pure path (`flightPose`, with its field of view) and is tested without a browser. `history.ts` holds
  `linkHistory`, which ties the browser's history to the visit. `route.ts` holds `stepForHash`, `hashForStep` and `titleForStep` (and `stopForHash`, `hashForStop`), which turn a URL
  hash into a stop and page and back, and name the tab. `cover.ts` holds `nextCover`, the cover limiter.
- **`src/shift/`**: the shift, start to finish. `createShift(reduced)` makes the one shift object; the app
  creates it and passes it to the room and the tour as a prop. Views read `shift.playing` (the shift the
  bar and the desk meter play; null once the visitor leaves its station) and hear changes with
  `shift.subscribe`: the bar subscribes, the tear subscribes (and plays out its own length when `playing`
  goes null), and the desk meter reads it every frame. The tour `mount`s it, calls `observe(where)`
  when a move starts and when it lands and `turn()` on a page change at a station. The tear reports straight to it (`tearStarted`,
  `turnStarted`), and the desk meter reports when its power-on really began (`powerOnBegan`). The room
  gives it one function to ask for a frame (`setWake`). The module owns the power-on timer, the power-on hold,
  the tear-over wake-up, the leaving rule, the page-turn limit and the
  shift's lengths (`SHIFT_SECONDS`). No shift starts until the desk meter reports its power-on, which it
  does on the first frame it draws once the room is ready (`src/App.tsx` sets `meter.on`,
  `src/DeskMeter.tsx` reports), so a room that never draws a frame plays no shift. `src/nixie.ts`
  re-exports `SHIFT_SECONDS` for the browser specs. `shift.hold` is the station the visitor is at (0 at the overview or in flight). The room
  asks it one question per station per frame, `shift.textState(station, nowMs)` (the shift knows where the visitor is): `held`,
  `resolving` or `showing`. Asking changes nothing; the module's state changes when it learns something
  (a shift fires, the visitor leaves).
- **`src/text/`**: a station's text. `ScreenPanels` renders the panels and holds their CSS states (`data-gated`,
  `data-glass`, `data-more`, the "more" cue). `TextPins` runs inside the canvas every frame, after the camera
  moves, and calls `placeText` for each panel: opacity, visibility, whether it takes the wheel, and its place
  over the glass or pinned beside the CRT. The room only mounts `TextPins`. The text keeps only what it last
  drew, in the module (a per-panel record), and writes it out as `data-gated` for the CSS and the browser
  specs: the resolve starts once when held text comes out, and a return just appears. The text *state* is
  never read back from the element; `placeText` still reads the panel's `maxHeight`, `scrollTop` and
  `scrollHeight` for layout. Whether the text is held, resolving or showing is the shift's to say
  (`textState`); the text module does not repeat that rule. `textCovers` (`src/text/place.ts`) says whether a panel's text is up enough to cover the meter; only
  its unit test calls it now, and nothing outside the module reads the panels' inline styles (the tear view only sets
  its filter).
- **`src/framing/`**: the framing. `framingFor({ width, height })` picks Square or Portrait, and is called with
  the current window each time. The framing answers `cameraAt(where, launch)` (camera, look and field of view; a flying Where is `flightPose` from the launch pose to the stop),
  `textOnGlass(where, station)`, `parallaxStrength(where)` and `panelPoint(crt)`, each taking a **Where**; nothing else decides
  the portrait split. The tour module (`src/tour.ts`) keeps `readingAt(where, gap)` and the mouse `parallax`; `panelStrength(where, station)` in `src/hold.ts` takes a Where. The room the HUD and the meter bar take is one pure rule of the window in `src/pin.ts` (`clearances`, with `deviceSize`); the camera's stop and the text panel both read it, and on a portrait window the panel takes all the free height. On a landscape window its top is one of five tiers (one row, two lines, and under `TWO_LINE_MIN_W` three lines, by width; or the compact two or three lines on a short window, by height as well, as the HUD entry says), so the stop and the panel clear the HUD at 800 px wide as at 1440 and at 667 x 375, and the glass is always above the device wherever the window is tall enough for `MIN_PANEL_H`.
- **`src/commits.ts`, `src/commits-saved.json` and `scripts/save-commits.mjs`**: the saved commits behind the git-log ambient screen. The production image has no `.git`, so `npm run build` runs `scripts/save-commits.mjs`, which reads this site's latest commits from the public GitHub mirror (`COMMITS_URL`, 5 s timeout, `COMMITS_API` replaces it) with `readCommits` and writes a gitignored local copy beside it; a failed call keeps the newer of that copy and the committed `src/commits-saved.json` by `savedAt` (`scripts/saved-commits.mjs`, as the gap's file works). `parseCommits` keeps the newest `COMMITS_LIMIT` (25) non-merge commits as `{ sha7, subject }`, the first line of each message, and drops a subject with a phone number or a private address. Nothing here runs in the browser: `src/Phosphor.tsx` imports the committed JSON by a relative path (the Vite alias for the local file matches only that path, so import it from a file directly in `src/`) and hands it to `ambientSurfaces`, which gives it to `drawGitlog`.
- **`src/content.ts`**: all copy in the app: station text, links, the bezel words and the page controls' words, and `ui`, the
  rest of what visitors see or hear (HUD, meter aria labels, boot log, signal lost, the gap's sentence).
  Templates take `{name}` placeholders through `fill`. Components hold none of it; a test fails if a `ui`
  word turns up quoted in other `src` code. `validateContent` covers every key. The build writes the page from it
  (`src/page-html.ts`, applied by a Vite plugin in dev and build): the head tags, and in `#root` the name and title
  (visible) and every station's text (visually hidden), so they are in the HTML before the script runs and the
  boot replaces them. Nothing is hand-kept in `index.html`. Failure
  codes such as `no-webgl` and the other identifiers stay in code: they are ids, not copy.
- The tour view (`TourView.tsx`) reports the visit to the shift and the HUD, and renders. The HUD (`Hud.tsx`) has the links: stations fly, Overview goes back. The meter bar (`Meter.tsx`) has the keys, and the arrow keys are heard in `TourView.tsx`. The room (`Room.tsx`, and the overlays `DeskMeter.tsx`, `Phosphor.tsx`, `Bezels.tsx`, `Rain.tsx`, `TvTargets.tsx`, `RoomClick.tsx`, with `draw.ts` for what they share) draws the
  scene and the desk meter. `card.ts` draws the phosphor screen and title card on each glass, and `glass.ts` projects a glass, or the phosphor plane that stands `SCREEN_LAYER` in front of it (`phosphorCorners` in `crts.ts`), to window pixels. `theme.css`, imported by `src/main.tsx`, is the focus ring and the boot progress bar's colours. The nixie module (`nixie.ts`) is the meter's digits and power-on; `meter-power.ts` is how lit the bar's device is through it.
- **`src/frames.ts`**: the frame loop. `runFrames(step, opts)` runs `step` with the seconds since the loop started,
  the first time at once with 0 s and then on each requested frame, until `step` returns true; it returns a function
  that stops it. Its clock and frame scheduler are `opts.now`, `opts.request` and `opts.cancel`, defaulting to
  `performance.now`, `requestAnimationFrame` and `cancelAnimationFrame`; `opts.onStart` gets the clock reading the loop
  counts from. `useTear` (`src/TearView.tsx`, through `playTear` in `src/tear-draw.ts`) and `useShifted` (`src/Meter.tsx`) run on it. Its timing is tested in
  `src/frames.test.ts` with a fake clock and a fake frame scheduler.
- **`src/tear.ts`** and **`tests/lib/snap.ts`**: the flash count takes the snap back from `snapBackMs` in
  `src/tear.ts` (where the slip reaches 0), and the browser specs watch for it with `tests/lib/snap.ts`
  (changed by ddf9420), not for the filter coming off. `playTear` (`src/tear-draw.ts`) writes displacement scale 0
  and edge 0 on its last step, before it takes the filter off, so a frame that steps from slip > 0 straight to done
  still leaves the snap back on record. Its stop function (a new play replacing a tear mid-way, or the view
  unmounting) makes the same writes, so a tear cut short leaves its snap back on record too; `src/tear-draw.test.ts` tests it with a fake clock.
