# Navigation is by click, not by scroll

The site used to be toured by scrolling a nine-screen page, with the camera following the scroll bar along a
fixed path. A recruiter skims for 30 to 60 seconds and wants to go straight to one thing: with scrolling they
don't know how far to go, they pass every station on the way, it is awkward on a phone, and there was no way to
link to one station. So the camera now follows a visit, not the scroll position. The site opens on an overview
of the room; the HUD's station links, the desk meter, the keys on the meter bar, the arrow keys, Esc, a click on a TV
and the overview's pins move the visitor; a flight goes straight to the chosen station and passes no other. The wheel
never moves the camera, and only scrolls a panel whose text is too long. Reduced motion gets a quick fade in place of a
flight. The shift is unchanged, and starts once the flight has landed. With no scroll there is nothing to restore after
a reload, so the shift's restore window is gone. The reasons and the full design are in spec #170.

Spec #280 amended the design in these ways. The rules above that it doesn't mention still hold.

- **Three stations, each with pages.** The tour has three monitors: Work, Projects and About me. Every station has at
  least one page, and the visit holds the stop and the page together.
- **One walk order.** The overview, then every page of Work, of Projects (the list, then each project) and of About me.
  Every next and prev control walks it: the arrow keys, the meter bar's keys, the desk meter's click and the on-screen
  Next and Back buttons. At the overview, previous does nothing; after About me's last page, next goes to the overview.
  Esc goes up one level: from a project page to the Projects list, from anywhere else to the overview.
- **Page moves replace history.** A move to another station or to the overview pushes a history entry. A move to
  another page of the same station replaces the current entry, so Back goes to the previous monitor or the overview and
  not through every page. A page move flies no camera: it tears the glass's text, or swaps it at once under reduced
  motion.
- **Deep links and old links.** URLs are hashes: `#work`, `#projects`, `#about` for a station's first page, and
  `#work/barracuda`, `#projects/mediasafe` and so on for a later page. Opening any known hash lands there with no flight,
  and Back goes to the overview. The links from before the three monitors (`#mediasafe`, `#home-lab`,
  `#software-factory`, `#contact`) redirect to their new place in the same way. An unknown hash opens the overview.
- **The overview's pins and Start button.** On a landscape window the overview carries a numbered pin over each monitor,
  a link that visits it, shown only where all three clear the HUD (from about 1380 px wide with today's pose). It
  also carries a "Start the tour" button above the meter bar until the first landing. A phone has no pins: its bottom
  bar of four buttons (Overview and the three stations) is the way in.
