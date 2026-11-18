# The Last watched line is read in the browser

"Off the keyboard" shows one live line, "Last watched: {title}", the title of the film or show Adham last watched
in MediaSafe (spec #336). It is the site's second live read, after the gap (ADR-0003).

- **What is read.** One call from the visitor's browser to a MediaSafe share link, made the first time the page is
  shown. The answer is a title alone, as `text/plain`. The site accepts it only when it is a 200 with that content
  type and a body that, trimmed, is 1 to 80 characters counted as Unicode code points, with no line break or other
  control character (`readLastWatched` and `LAST_WATCHED_MAX` in `src/last-watched.ts`). The title is shown as text,
  never as markup. MediaSafe sends the title as stored; whether it is short enough to show is this site's rule.
- **Sharing is opt-in at the source.** MediaSafe shares nothing by default. A user switches the setting on and gets a
  secret link; switching it off makes the link answer 404 at once, and "New link" retires the old one. Nothing but
  the title is revealed: no date, episode, rating or history.
- **When the read fails the line is hidden, and nothing is saved.** A failed call, a timeout (5 s) or any answer
  that isn't accepted shows no line. The gap does the opposite under ADR-0003 and saves a value at build time; a
  saved title could be weeks old, so this line has none.
- **The one exception to "nothing on a TV may look like live data".** ADR-0007 keeps that rule for the ambient
  screens and for page text, and `validateContent` checks it. The Last watched line is live by design, and in the
  Square framing the panel's text sits on the TV's glass, so it is the rule's one exception. The rule holds for
  everything else.
- **Why ADR-0003's reasons still hold.** The site stays static and runs no backend. The call goes to a public route
  that MediaSafe opens under its own rules (the link's token is the credential, as the calendar feed's is), not a
  way into Adham's cluster. Nothing private is exposed beyond the title Adham chose to share.

ADR-0003 stays as the gap's. The link itself is Adham's share link, kept in the site's code, which is public: anyone
who reads it can ask MediaSafe the same question. If the link is replaced or switched off, the line stays hidden
until a change to this site with the new link is merged, released and promoted.
