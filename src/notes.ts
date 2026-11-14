// The sticky note on each station's bezel: its colour and tilt (radians), pinned to the station by id so a
// TV leaving the room can't change the others' (they used to be picked by a TV's place in the list).
// A station keeps the note style of the CRT it sits on: Work is the old MediaSafe CRT's, About me the old Contact's.
// Every note differs in both. Tilts are small enough that the note still covers the part of the
// baked note left of the glass (see Bezels.tsx).
const NOTES: Record<string, { colour: string; tilt: number }> = {
  work: { colour: "#f2a6b8", tilt: 0.02 }, // the colour and tilt of the CRT that was MediaSafe's
  projects: { colour: "#a8e6b4", tilt: 0.04 }, // the bench TV's own
  about: { colour: "#d3b8f0", tilt: -0.01 }, // the colour and tilt of the CRT that was Contact's
};

export function noteStyleFor(stationId: string) {
  const note = NOTES[stationId];
  if (!note) throw new Error(`no sticky note style for station "${stationId}"`);
  return note;
}
