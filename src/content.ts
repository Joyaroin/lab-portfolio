// All copy in the app: visible text, aria labels, boot log lines, the signal lost screen and the
// gap's sentence, plus links. Change copy here and nowhere else: no component or 3D code holds copy.
// The build writes the page's head tags and the pre-boot markup from this module (src/page-html.ts);
// nothing is hand-kept in index.html.
// `validateContent` runs in the tests (and so in `make frontend`); it blocks phone numbers and
// private or tailnet addresses. Internal employer names are NOT caught here: Adham's review of
// any content PR catches those.

export type Link = { label: string; href: string };
export type Station = {
  id: string;
  name: string;
  /** the station's fixed meter reading: arbitrary, and not a number from the series */
  reading: number;
  /** plain heading shown on the CRT */
  heading: string;
  /** a line under the heading that belongs to the whole station (Work's, About me's), not to a page */
  line?: string;
  /** The station's bullets, in order, for a station that keeps a whole text (Work). When it is set,
   *  the pages' bullets are the same strings, in the same order. Other stations keep their text on
   *  their pages only. */
  body?: string[];
  /** The station's pages, in walk order. Every station has at least one; the first is what shows when
   *  the visitor arrives. */
  pages: Page[];
  /** Whether Esc on one of this station's later pages goes up to its first page. Without it, up goes to the overview. */
  upToFirstPage?: boolean;
  /** What one page of this station is, for the Next button's words ("Next job: …", "Next project: …"). Without it the button says "Next: {page} →". */
  pageNoun?: "job" | "project";
  /** words on the TV's bezel: the maker's plate and the sticky note. Neither may read as a status. */
  bezel: Bezel;
};
/** One page of a station: its lead (a page may have none), its bullets (at most three, and none for a
 *  list page), and the diagram and links that go with them. `label` names it. `dates` and `months` are
 *  only on Work's job pages: `dates` show on the job's tab, and `months` is how long it ran. `stat` is a project
 *  page's one stat line, the one statement of that fact on the page: no bullet repeats it. `list` is the Projects list page's prompt, rows
 *  and foot. */
export type Page = {
  id: string; label: string; dates?: string; months?: number;
  lead?: string; body: string[];
  stat?: string;
  list?: PageList;
  /** optional line drawing of facts already in the lead and `body` */
  diagram?: Diagram;
  links: Link[];
  /** #340: the page's image, if it has one. Only its words and its file's name are here, never an import: vite.config.ts imports this
   *  module to write the page, so it can't load a picture. The panel (src/text/ScreenPanels.tsx) turns `file` into the file in src/assets/.
   *  `alt` is its alt text, and `caption` an optional line of page text. `place` is where it sits: "top" beside the page's heading,
   *  lead and stat line (the About me portrait; above them in a portrait window), or "below" the bullets. `larger` is whether it opens
   *  larger on a click. validateContent checks the words, and rejects an image with no alt text; it can't check that the file exists. */
  image?: PageImage;
  /** #369: the page carries the Last watched line (ADR-0008). `bullet` is the index in `body` of the bullet the line sits inside, and `words`
   *  the line's template, with `{title}` where the live title goes. The line isn't written into the page's HTML: the title is known only live.
   *  validateContent checks the words like other page text, that they hold {title}, and that `bullet` is one of the page's bullets. */
  lastWatched?: { bullet: number; words: string };
};
/** A page's image (see `Page.image`). */
export type PageImage = { file: string; alt: string; caption?: string; place: "top" | "below"; larger?: boolean };
/** A list page: a shell prompt, one row per page of the same station (`name` is the row's text, `tag` its
 *  tech line; its stat is that page's `stat`), and a line at the foot. */
export type PageList = { prompt: string; rows: { page: string; name: string; tag: string }[]; foot: string };
/** The most bullets a page may have. */
export const MAX_BULLETS = 3;
/** `plate` is an invented maker and model (no real brand, nothing from the series, ADR-0002). */
export type Bezel = { plate: string; note: string };
/** A chain of steps drawn left to right. `hops[i]` labels the arrow from step i to step i+1
 *  ("" for none), so it has one entry fewer than `steps`. `description` is the plain-text version
 *  a screen reader gets. */
export type Diagram = { description: string; steps: string[]; hops: string[] };
/** The app's other words. Strings with `{name}` in them are templates: `fill` puts the values in. */
export const ui = {
  /** the HUD's link back to the overview, and the nav's aria label */
  room: "Overview",
  hudLabel: "HUD",
  /** the cue at the foot of a panel with more text below */
  more: "more ▾",
  /** the meter's label while the gap is still being read */
  readingPending: "reading prod and staging…",
  /** the meter's accessible name ({digits}) */
  meterReading: "Reading {digits}",
  /** the gap's sentence: {n} deploys, {noun} one of the two nouns */
  gapBehind: "MediaSafe: {n} staging {noun} since the last prod release",
  gapBehindAtLeast: "MediaSafe: at least {n} staging {noun} since the last prod release",
  /** the same two sentences, short, for a short landscape window (the compact HUD), where the line under the device must stay one line */
  gapBehindShort: "MediaSafe: {n} {noun} ahead of prod",
  gapBehindAtLeastShort: "MediaSafe: {n}+ {noun} ahead of prod",
  gapSaved: "{gap} (saved value, not live)",
  deploy: "deploy",
  deploys: "deploys",
  /** the boot screen */
  loadProgress: "Load progress",
  bootLog: "Boot log",
  stepCapability: "capability check",
  stepCode: "room code",
  stepScene: "room scene",
  logDone: "[ ok ] {step}",
  logPending: "[ .. ] {step}",
  logPowerOn: "[ ok ] meter power-on",
  /** the signal lost screen; {reason} is the failure's code, which is not copy */
  signalLost: "SIGNAL LOST",
  signalLostReason: "The 3D room could not start in this browser ({reason}).",
  /** the stop controls: the keys' caps, the buttons' aria labels, and the line naming the stop */
  keyPrev: "PREV",
  keyRoom: "ROOM",
  keyNext: "NEXT",
  keyStart: "START",
  prevStation: "Previous page",
  backToRoom: "Back to the overview",
  nextStation: "Next page",
  startTour: "Start the tour",
  /** the line under the meter at a named page: "Monitor 2 of 3 · Projects · MediaSafe" */
  stopLine: "Monitor {n} of {total} · {station} · {page}",
  /** the same on a station's list page (the Projects list), which has no name of its own: "Monitor 2 of 3 · Projects" */
  listStopLine: "Monitor {n} of {total} · {station}",
  /** the tab title on a named page: "MediaSafe · Projects · Adham Sedik" */
  stationTitle: "{page} · {station} · {name}",
  /** the tab title on a list page: "Projects · Adham Sedik" */
  listTitle: "{station} · {name}",
  // Marked, empty groups: each later ticket fills in only its own. validateContent already walks them.
  /** The controls on every station's glass (#284): the breadcrumb, the tabs, the Next and Back buttons. Strings with
   *  `{name}` in them are templates. */
  pageControls: {
    /** the first line of every panel: "Monitor 1 · Work" ({n} is the station's place in the tour) */
    crumb: "Monitor {n} · {station}",
    /** on a project page the crumb is this link back to the list, then " / {project}" */
    crumbList: "~/projects",
    crumbProject: " / {project}",
    /** the tabs' accessible name */
    tabs: "Pages",
    /** the Next button: the next job, the next project, the next page of a station, the next station, and (on About's last page) back to the overview */
    nextJob: "Next job: {company} →",
    nextProject: "Next project: {name} →",
    nextPage: "Next: {page} →",
    nextMonitor: "Next: {station} →",
    toOverview: "Back to overview",
    /** the Back button: "← Solace", "← All projects" */
    back: "← {page}",
  } as Record<string, string>,
  /** #285: the overview and the HUD. The Start button on the overview, until the first landing at a station: its words, and the
   *  line under it (landscape, and portrait, where the phone bar is below) */
  hud: {
    start: "Start the tour",
    startCount: "· 3 monitors",
    startOrLandscape: "or click a monitor",
    startOrPortrait: "or pick one below",
  },
  /** #344: the small image's button and the open image's button. Both are names, not captions: the open image is named by its alt text. */
  imageLarger: { open: "Show the screenshot larger", close: "Close" } as Record<string, string>,
  /** #293: the pins over the monitors */
  pins: { work: "1 Work", projects: "2 Projects", about: "3 About me" } as Record<string, string>,
  /** #290: the ambient screens on the spare CRTs. Drawn on a canvas, so not in the page's HTML.
   *  The commit lines come from src/commits-saved.json, not from here. */
  ambient: {
    gitlogCommand: "$ git log --oneline",
    tunnel: "Tunnel", proxmox: "Proxmox", k3s: "k3s",
    trafficCaption: "internet → home lab",
    wordReliable: "RELIABLE", wordMaintainable: "MAINTAINABLE", wordSecure: "SECURE",
    puzzleDecoding: "[ decoding… ]", puzzleSolved: "[ solved ]",
  } as Record<string, string>,
  /** #387: what the line under the meter says while the pointer rests on a click target in the room, by its id in src/room-layout.json: where the click goes. */
  propHover: { rack: "Home lab", "desk-phone-target": "Contact" } as Record<string, string>,
  /** #384 and #385: the whiteboard's words (the board's drawing, drawn at runtime on the blank board baked in #380). Marked, empty: #385 fills in only this group. */
  whiteboard: {} as Record<string, string>,
};
/** The placeholders each template must keep. */
const PLACEHOLDERS: Record<string, string[]> = {
  meterReading: ["digits"], gapBehind: ["n", "noun"], gapBehindAtLeast: ["n", "noun"],
  gapBehindShort: ["n", "noun"], gapBehindAtLeastShort: ["n", "noun"],
  gapSaved: ["gap"], stopLine: ["station", "page", "n", "total"], listStopLine: ["station", "n", "total"], logDone: ["step"], logPending: ["step"], signalLostReason: ["reason"],
  stationTitle: ["page", "station", "name"], listTitle: ["station", "name"],
  lastWatched: ["title"],
  crumb: ["n", "station"], crumbProject: ["project"], nextJob: ["company"], nextProject: ["name"], nextPage: ["page"], nextMonitor: ["station"], back: ["page"],
};
export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
/** The line under the meter at a page: "Monitor {n} of {total} · {station} · {page}", or "Monitor {n} of {total} · {station}" on a list page. `n` is the station's number. */
export function stopLineText(s: Station, p: Page, n: number, total: number): string {
  return p.list ? fill(ui.listStopLine, { station: s.name, n, total }) : fill(ui.stopLine, { station: s.name, page: p.label, n, total });
}
export type Content = {
  identity: { name: string; title: string; pageTitle: string; availability: string; description: string; imageAlt: string };
  links: Link[];
  stations: Station[];
  ui: typeof ui;
};

// Links that more than one station or the HUD uses, written once.
const LINKEDIN: Link = { label: "LinkedIn", href: "https://www.linkedin.com/in/adham-sedik-971a57184/" };
const GITHUB: Link = { label: "GitHub", href: "https://github.com/Joyaroin" };
export const RESUME: Link = { label: "Résumé", href: "/resume.pdf" };
const SITE_SOURCE: Link = { label: "This site's source", href: "https://github.com/Joyaroin/lab" };

// Work's two jobs, written once: the station shows them as two pages, each with its own lead.
const SOLACE_LEAD = "Solace · Software Developer Co-op, Platform Engineering · Sep–Dec 2026";
const SOLACE = [
  "I made the EC2 proxies behind CI/CD builds heal themselves: an out-of-memory instance reboots and reports to Slack on its own, since proven on a real outage.",
  "I built an S3 artifact store in Terraform that gives a customer-facing UI pinned releases it can roll back.",
  "I automated product offboarding across UI, API, data model and scripts, ending 30–60 minutes of manual cleanup each time.",
];
const BARRACUDA_LEAD = "Barracuda Networks · Software Engineer Co-op, BarracudaONE Platform · Sep 2025–Aug 2026";
const BARRACUDA = [
  "I built a hotfix workflow that branches from the commit actually in production. It's used by 18 service repos and saves 5–10 minutes per ticket.",
  "I built a Claude API test-scenario generator with a Jira MCP server. All 15 developers use it, and it cut test-note writing by about 40%.",
  "I wrote Terraform for production AWS (VPC, ALB, IAM, ECR, External Secrets) and shipped C#/.NET and React features across about 60 tickets.",
];

export const content: Content = {
  ui,
  identity: {
    name: "Adham Sedik",
    title: "Software & Platform Engineer",
    pageTitle: "Adham Sedik · Lab",
    availability: "Graduating Dec 2027.",
    /** the meta description, and the link preview's text */
    description:
      "Adham Sedik, Software & Platform Engineer. Tour a 3D home lab: my work, my projects (an AI software factory, MediaSafe, my home Kubernetes cluster) and about me.",
    /** the preview image's alt text */
    imageAlt: "The lab at night: three lit monitors marked Work, Projects and About me, and a nixie meter on a desk, with Adham Sedik's name",
  },

  links: [
    RESUME,
    LINKEDIN,
    GITHUB,
  ],

  // Real copy, in tour order: Work, Projects, About me. Plain descriptions.
  // Every fact here comes from spec #165, and the copy spec #280 approved. Add nothing that is not there.
  stations: [
    {
      id: "work", name: "Work", reading: 214, pageNoun: "job",
      heading: "Work experience",
      line: "Two platform co-ops, 16 months in all. Newest first.",
      // `body` is the whole text in order (Solace, then Barracuda); `pages` splits the same bullets.
      // Work has no lead of its own: each page has one.
      body: [...SOLACE, ...BARRACUDA],
      pages: [
        { id: "solace", label: "Solace", dates: "Sep to Dec 2026", months: 4, lead: SOLACE_LEAD, body: SOLACE, links: [LINKEDIN] },
        { id: "barracuda", label: "Barracuda", dates: "Sep 2025 to Aug 2026", months: 12, lead: BARRACUDA_LEAD, body: BARRACUDA, links: [LINKEDIN] },
      ],
      bezel: { plate: "HALDEN HX-214", note: "Write the\nrunbook" },
    },
    {
      id: "projects", name: "Projects", reading: 733,
      heading: "Things I've built and run",
      upToFirstPage: true, // Esc on a project page goes up to the list
      pageNoun: "project",
      pages: [
        {
          id: "list", label: "All projects", body: [], links: [],
          list: {
            prompt: "~/projects $ ls",
            rows: [
              { page: "software-factory", name: "software-factory/", tag: "AI agents · CI/CD" },
              { page: "mediasafe", name: "mediasafe/", tag: "Next.js · Postgres · GitOps" },
              { page: "home-lab", name: "home-lab/", tag: "Proxmox · k3s · Terraform · Cloudflare" },
            ],
            foot: "Pick a project to open it.",
          },
        },
        {
          id: "software-factory", label: "Software factory",
          lead: "My AI software factory: I plan, and agents build, review and merge. It built this site.",
          stat: "100+ merged PRs since 5 November 2026",
          body: [
            "I plan a feature with an orchestrator agent, which cuts it into small tickets. Builder agents write each ticket test-first on my Mac and open a pull request.",
            "Every PR runs CI on my own runner. Then a fresh reviewer agent decides whether it merges by itself, needs me, or goes back for a rebuild.",
            "Production moves only when I promote it.",
          ],
          diagram: {
            description: "I plan, agents build each ticket and open a PR, a reviewer agent decides, and it merges.",
            steps: ["Plan", "Build", "Review", "Merge"],
            hops: ["tickets", "PR", "decides"],
          },
          links: [SITE_SOURCE],
        },
        {
          id: "mediasafe", label: "MediaSafe",
          image: { file: "mediasafe-library.jpg", alt: "MediaSafe's Library page, showing three of the shows Adham tracks.", place: "top", larger: true },
          lead: "My tracker for shows and films, built and run by me alone. Next.js 16 and Postgres.",
          stat: "170+ merged PRs since August 2026",
          body: [
            "Git is the only way it changes: Argo CD ships every merge to staging, and I promote to production by hand.",
            "Secrets live in Vault, backed up nightly to Cloudflare R2, with a restore I've tested.",
          ],
          diagram: {
            description: "Git is the only way it changes. Argo CD ships every merge to staging. I promote to production by hand.",
            steps: ["Git", "Argo CD", "Staging", "Production"],
            hops: ["", "every merge", "by hand"],
          },
          links: [
            { label: "MediaSafe repo", href: "https://github.com/Joyaroin/MediaSafe" },
            { label: "Deploy repo", href: "https://github.com/Joyaroin/morioh-cho-gitops" },
            { label: "mediasafe.space (Google sign-in)", href: "https://mediasafe.space" },
          ],
        },
        {
          id: "home-lab", label: "Home lab",
          lead: "This site runs on my own Kubernetes cluster at home. All traffic comes in through a Cloudflare Tunnel.",
          stat: "No ports open at home",
          body: [
            "Two Proxmox hosts: joseph runs single-node k3s, my Git server and home DNS; jotaro runs only the CI runner.",
            "Terraform and Ansible define the VMs, backups and access rules, and a weekly job checks for drift.",
            "The CI runner is firewalled off from my home network.",
          ],
          diagram: {
            description: "All traffic comes in through a Cloudflare Tunnel. joseph runs a single-node k3s cluster.",
            steps: ["Cloudflare Tunnel", "joseph", "k3s cluster"],
            hops: ["traffic", "runs"],
          },
          links: [],
        },
      ],
      bezel: { plate: "HALDEN HX-418", note: "Patch the\ncluster" },
    },
    {
      id: "about", name: "About me", reading: 861,
      heading: "Hi, I'm Adham.",
      line: "Honours Computer Science, Software Engineering stream, at Carleton University in Ottawa.",
      pages: [
        {
          id: "why-i-do-this", label: "Why I do this",
          image: { file: "adham.jpg", alt: "Adham Sedik, smiling, in glasses and a black polo", place: "top" },
          lead: "I'm a software and platform engineer who cares about systems that stay up and stay easy to change. Reliability and maintainability are what I build for, and security is what keeps pulling me in: every system is a puzzle about how it could break.",
          body: [], links: [],
        },
        {
          id: "off-the-keyboard", label: "Off the keyboard",
          image: { file: "golf-day.jpg", alt: "Adham and his Solace teammates on a golf course.", caption: "Team golf day at Solace.", place: "below" },
          body: [
            "Tennis. Most weeks, on a court somewhere in Ottawa.",
            "Films and shows. I log everything I watch in MediaSafe, the tracker I built.",
          ],
          // the line under the watching bullet (index 1); the title is read live (src/last-watched.ts)
          lastWatched: { bullet: 1, words: "Last watched: {title}" },
          links: [],
        },
        {
          id: "contact", label: "Contact",
          body: ["I graduate in December 2027."],
          links: [
            { label: "adhamsedik@cmail.carleton.ca", href: "mailto:adhamsedik@cmail.carleton.ca" },
            LINKEDIN,
            GITHUB,
            SITE_SOURCE,
            RESUME,
          ],
        },
      ],
      bezel: { plate: "HALDEN HX-607", note: "Court\nat 7" },
    },
  ],
};

export const { identity, links, stations } = content;

// --- validation ---

// A run of digits and separators holding 10 or more digits: 613-555-0142, (613) 555 0142,
// +1 613 555 0142, 6135550142. Years like "2024-2025" have only 8 digits and pass.
const PHONE_RUN = /\+?\d[\d\s().-]{8,}\d/g;
export const hasPhoneNumber = (s: string) =>
  (s.match(PHONE_RUN) ?? []).some((run) => run.replace(/\D/g, "").length >= 10);

const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.]*\d)/g;
function hasPrivateIPv4(s: string) {
  for (const m of s.matchAll(IPV4)) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT range, which tailnets use
  }
  return false;
}
const PRIVATE_IPV6 = /(?<![\w:])(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):[0-9a-f:]*/i; // ULA, link-local
const PRIVATE_HOST = /(?<![\w-])(localhost|[\w-]+(\.[\w-]+)*\.(ts\.net|local|lan|internal|home\.arpa|intranet))(?![\w-])/i;
/** Exported for the ambient screens (#289), which check their own lines against it. */
export const hasPrivateAddress = (s: string) =>
  hasPrivateIPv4(s) || PRIVATE_IPV6.test(s) || PRIVATE_HOST.test(s);

// Words that make a title card read as a live result ("hamon Ready", "Synced", "42 passing").
// The card is drawn on a TV, and nothing on a TV may look like live data.
const LIVE_STATUS = /\b(ready|synced|passing|failing|ok|healthy|running|failed|error|degraded|up to date)\b/i;

const SAFE_HREF = /^(https:\/\/|mailto:|\/(?!\/))/i;

export function validateContent(c: Content): string[] {
  const problems: string[] = [];
  const text = (path: string, v: unknown, isHref = false) => {
    if (typeof v !== "string" || v.trim() === "") return void problems.push(`${path}: missing`);
    if (hasPhoneNumber(v)) problems.push(`${path}: looks like a phone number`);
    if (hasPrivateAddress(v)) problems.push(`${path}: contains a private address`);
    if (isHref && !SAFE_HREF.test(v)) problems.push(`${path}: must be https:, mailto: or a site path`);
  };
  const paragraphs = (path: string, list: unknown) => {
    if (!Array.isArray(list) || list.length === 0) return void problems.push(`${path}: missing`);
    list.forEach((b, i) => text(`${path}[${i}]`, b));
  };
  // Text drawn on a TV (title card, diagram) is checked like other copy, and must not read as live.
  const tvText = (path: string, v: unknown) => {
    text(path, v);
    if (typeof v === "string" && LIVE_STATUS.test(v)) problems.push(`${path}: reads as a live status`);
  };
  const diagram = (dp: string, d: Diagram) => {
    tvText(`${dp}.description`, d.description);
    if (!Array.isArray(d.steps) || d.steps.length === 0) problems.push(`${dp}.steps: missing`);
    else d.steps.forEach((t, j) => tvText(`${dp}.steps[${j}]`, t));
    if (!Array.isArray(d.hops)) problems.push(`${dp}.hops: must be a list`);
    else {
      if (Array.isArray(d.steps) && d.hops.length !== d.steps.length - 1) problems.push(`${dp}.hops: need one fewer than steps`);
      d.hops.forEach((t, j) => { if (t !== "") tvText(`${dp}.hops[${j}]`, t); });
    }
  };
  const linkList = (path: string, list: unknown) => {
    if (!Array.isArray(list)) return void problems.push(`${path}: missing`);
    list.forEach((l: Partial<Link>, i) => {
      text(`${path}[${i}].label`, l?.label);
      text(`${path}[${i}].href`, l?.href, true);
    });
  };

  // Every shipped key must be present, and a key added to the given content is checked too.
  // A word is a string; a group (the marked, empty ones later tickets fill) is an object of words, walked the same way.
  const isGroup = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  // The ambient screens are drawn on a TV, so their words must not read as live data (the commit lines aren't here).
  const walkWords = (path: string, given: unknown, shipped: unknown) => {
    if (isGroup(shipped)) {
      if (!isGroup(given)) return void problems.push(`${path}: missing`);
      for (const k of new Set([...Object.keys(shipped), ...Object.keys(given)])) walkWords(`${path}.${k}`, given[k], shipped[k]);
      return;
    }
    if (path.startsWith("ui.ambient.")) tvText(path, given); else text(path, given);
    const key = path.split(".").pop()!;
    if (typeof given === "string") for (const ph of PLACEHOLDERS[key] ?? []) if (!given.includes(`{${ph}}`)) problems.push(`${path}: must contain {${ph}}`);
  };
  walkWords("ui", c.ui ?? {}, ui);
  text("identity.name", c.identity?.name);
  text("identity.title", c.identity?.title);
  text("identity.pageTitle", c.identity?.pageTitle);
  text("identity.availability", c.identity?.availability);
  text("identity.description", c.identity?.description);
  text("identity.imageAlt", c.identity?.imageAlt);
  linkList("links", c.links);
  if (!Array.isArray(c.stations) || c.stations.length === 0) problems.push("stations: missing");
  (c.stations ?? []).forEach((s, i) => {
    const p = `stations[${i}]`;
    text(`${p}.id`, s.id);
    text(`${p}.heading`, s.heading);
    if (s.line !== undefined) text(`${p}.line`, s.line);
    tvText(`${p}.name`, s.name);
    if (typeof s.reading !== "number" || !Number.isFinite(s.reading)) problems.push(`${p}.reading: missing`);
    if (!Array.isArray(s.pages) || s.pages.length === 0) problems.push(`${p}.pages: need at least one`);
    else {
      const pp = `${p}.pages`;
      s.pages.forEach((pg, j) => {
        const q = `${pp}[${j}]`;
        text(`${q}.id`, pg.id);
        tvText(`${q}.label`, pg.label);
        // A job page is the only kind with dates and months. Either one, when given, is checked.
        if (pg.dates !== undefined) tvText(`${q}.dates`, pg.dates);
        if (pg.months !== undefined && (!Number.isInteger(pg.months) || pg.months <= 0)) problems.push(`${q}.months: must be a whole number above 0`);
        // A page's lead is optional, but a page is never empty: it has a lead, bullets or a list.
        if (pg.lead !== undefined) text(`${q}.lead`, pg.lead);
        else if (!(Array.isArray(pg.body) && pg.body.length) && !pg.list) problems.push(`${q}.lead: missing`);
        if (pg.stat !== undefined) text(`${q}.stat`, pg.stat);
        if (pg.list) {
          const l = pg.list;
          text(`${q}.list.prompt`, l.prompt);
          text(`${q}.list.foot`, l.foot);
          if (!Array.isArray(l.rows) || l.rows.length === 0) problems.push(`${q}.list.rows: missing`);
          else l.rows.forEach((r, k) => {
            text(`${q}.list.rows[${k}].name`, r.name);
            text(`${q}.list.rows[${k}].tag`, r.tag);
            const target = s.pages.find((x) => x.id === r.page);
            if (!target) problems.push(`${q}.list.rows[${k}].page: no page "${r.page}" in this station`);
            else if (!target.stat) problems.push(`${q}.list.rows[${k}].page: "${r.page}" has no stat to show`);
          });
        }
        // A page may have no bullets (a list page), but never more than three.
        if (!Array.isArray(pg.body)) problems.push(`${q}.body: must be a list`);
        else {
          pg.body.forEach((b, k) => text(`${q}.body[${k}]`, b));
          if (pg.body.length > MAX_BULLETS) problems.push(`${q}.body: at most ${MAX_BULLETS} bullets`);
        }
        linkList(`${q}.links`, pg.links);
        if (pg.diagram) diagram(`${q}.diagram`, pg.diagram);
        if (pg.image) {
          const im = pg.image;
          text(`${q}.image.file`, im.file);
          text(`${q}.image.alt`, im.alt);
          if (im.caption !== undefined) text(`${q}.image.caption`, im.caption);
          if (im.place !== "top" && im.place !== "below") problems.push(`${q}.image.place: must be top or below`);
        }
        if (pg.lastWatched) {
          const lw = pg.lastWatched;
          text(`${q}.lastWatched.words`, lw.words);
          if (typeof lw.words === "string") for (const ph of PLACEHOLDERS.lastWatched) if (!lw.words.includes(`{${ph}}`)) problems.push(`${q}.lastWatched.words: must contain {${ph}}`);
          if (!Number.isInteger(lw.bullet) || lw.bullet < 0 || !Array.isArray(pg.body) || lw.bullet >= pg.body.length) problems.push(`${q}.lastWatched.bullet: must be one of the page's bullets`);
        }
      });
      // A station that keeps a whole text (Work) must have pages that add up to it.
      if (s.body !== undefined) {
        paragraphs(`${p}.body`, s.body);
        const joined = s.pages.flatMap((pg) => (Array.isArray(pg.body) ? pg.body : []));
        if (JSON.stringify(joined) !== JSON.stringify(s.body)) problems.push(`${pp}: bullets must be the same as ${p}.body, in order`);
      }
    }
    for (const f of ["plate", "note"] as const) tvText(`${p}.bezel.${f}`, s.bezel?.[f]);
  });
  return problems;
}
