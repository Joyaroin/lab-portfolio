import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { content, identity, stations, type Content } from "./content";
import { CLIP_STYLE, escapeHtml, headTags, rootHtml, transformPage } from "./page-html";

const tags = headTags(content);
const root = rootHtml(content);
const esc = escapeHtml;

describe("head tags", () => {
  it("has the page title", () => expect(tags).toContain(`<title>${esc(identity.pageTitle)}</title>`));
  it("has the meta description", () => expect(tags).toContain(`<meta name="description" content="${esc(identity.description)}" />`));
  it("has the canonical link", () => expect(tags).toContain('<link rel="canonical" href="https://lab.mediasafe.space/" />'));
  it("has the Open Graph tags", () => {
    expect(tags).toContain('<meta property="og:type" content="website" />');
    expect(tags).toContain('<meta property="og:url" content="https://lab.mediasafe.space/" />');
    expect(tags).toContain(`<meta property="og:title" content="${esc(identity.pageTitle)}" />`);
    expect(tags).toContain(`<meta property="og:description" content="${esc(identity.description)}" />`);
  });
  it("has the Twitter card", () => expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />'));
  it("escapes what it writes into attributes", () => {
    const c: Content = structuredClone(content);
    c.identity.description = `a "b" <c> & 'd'`;
    expect(headTags(c)).toContain('<meta name="description" content="a &quot;b&quot; &lt;c&gt; &amp; &#39;d&#39;" />');
  });
});

describe("#root before boot", () => {
  it("shows the name and title, visible", () => {
    const visible = root.slice(0, root.indexOf(`<div style="${CLIP_STYLE}">`));
    expect(visible).toContain(`>${esc(identity.name)}</h1>`);
    expect(visible).toContain(`>${esc(identity.title)}</p>`);
    expect(visible).not.toContain("clip");
  });
  it("hides the station block with the clip pattern, not display:none", () => {
    expect(root).toContain(`<div style="${CLIP_STYLE}">`);
    expect(CLIP_STYLE).toMatch(/width:1px;height:1px/);
    expect(CLIP_STYLE).toContain("clip:rect(0 0 0 0)");
    expect(root).not.toContain("display:none");
  });
  it.each(stations.map((s) => [s.id, s] as const))("%s: heading, line, leads, stats and bullets are in the block, escaped", (_id, s) => {
    expect(root).toContain(`<h2>${esc(s.heading)}</h2>`);
    if (s.line) expect(root).toContain(`<p>${esc(s.line)}</p>`);
    for (const p of s.pages) {
      if (p.lead) expect(root).toContain(`<p>${esc(p.lead)}</p>`);
      if (p.stat) expect(root).toContain(`<p>${esc(p.stat)}</p>`);
      for (const b of p.body) expect(root).toContain(`<li>${esc(b)}</li>`);
    }
  });
  it("writes each page of a station with several with its label as a heading, and a station with one page without", () => {
    for (const s of stations) for (const p of s.pages) expect(root.includes(`<h3>${esc(p.label)}</h3>`)).toBe(s.pages.length > 1);
    const c: Content = structuredClone(content);
    c.stations = [{ ...c.stations[2], pages: [c.stations[2].pages[2]] }];
    expect(rootHtml(c)).not.toContain("<h3>");
  });
  it("writes the Projects list: its prompt, a row for each project with its tag and stat, and its foot", () => {
    const list = stations.find((s) => s.id === "projects")!.pages[0].list!;
    expect(root).toContain(`<p>${esc(list.prompt)}</p>`);
    expect(root).toContain("<li>software-factory/ AI agents · CI/CD, 100+ merged PRs since 5 November 2026</li>");
    expect(root).toContain("<li>mediasafe/ Next.js · Postgres · GitOps, 170+ merged PRs since August 2026</li>");
    expect(root).toContain("<li>home-lab/ Proxmox · k3s · Terraform · Cloudflare, No ports open at home</li>");
    expect(root).toContain(`<p>${esc(list.foot)}</p>`);
  });
  it("writes the new stations' words and none of the old stations'", () => {
    for (const w of ["Things I&#39;ve built and run", "Hi, I&#39;m Adham.", "Why I do this", "Off the keyboard", "Tennis. Most weeks, on a court somewhere in Ottawa."]) expect(root).toContain(w);
    expect(root).not.toContain("<h2>Contact</h2>");
    expect(root).not.toContain("<h2>MediaSafe</h2>");
  });
  it("writes a page's image caption as text, and the image itself not at all (#342)", () => {
    const captions = stations.flatMap((s) => s.pages.flatMap((p) => (p.image?.caption ? [p.image.caption] : [])));
    expect(captions).toContain("Team golf day at Solace.");
    for (const c of captions) expect(root).toContain(`<p>${esc(c)}</p>`);
    // nothing is fetched at boot: no <img> and no file name in the pre-boot HTML
    expect(root).not.toContain("<img");
    expect(root).not.toContain("golf-day");
    const c: Content = structuredClone(content);
    c.stations[2].pages[1].image!.caption = `a "b" <c>`;
    expect(rootHtml(c)).toContain("<p>a &quot;b&quot; &lt;c&gt;</p>");
  });
  it("has no Last watched line, not even an empty \"Last watched:\" (#369: the title is known only live)", () => {
    expect(stations[2].pages[1].lastWatched).toBeDefined();
    expect(root).not.toMatch(/last watched/i);
    expect(root).not.toContain("{title}");
    // the watching bullet is written as it is
    expect(root).toContain("<li>Films and shows. I log everything I watch in MediaSafe, the tracker I built.</li>");
  });
  it("writes a page with no bullets without an empty list", () => {
    const c: Content = structuredClone(content);
    c.stations[0].pages[0].body = [];
    const html = rootHtml(c);
    expect(html).not.toContain("<ul></ul>");
    expect(html).toContain(`<p>${esc(c.stations[0].pages[0].lead!)}</p>`);
  });
  it("writes Work's pages: label, dates, lead and body", () => {
    for (const p of stations.find((s) => s.id === "work")!.pages) {
      expect(root).toContain(`<h3>${esc(p.label)}</h3>`);
      expect(root).toContain(`<p>${esc(p.dates!)}</p>`);
      expect(root).toContain(`<p>${esc(p.lead!)}</p>`);
    }
  });
  it("writes Work's bullets once", () => {
    for (const b of stations.find((s) => s.id === "work")!.body!) expect(root.split(`<li>${esc(b)}</li>`)).toHaveLength(2);
  });
  it("puts every station link in as a link that keyboard focus skips", () => {
    for (const l of stations.flatMap((s) => s.pages.flatMap((p) => p.links))) expect(root).toContain(`<a href="${esc(l.href)}" tabindex="-1">${esc(l.label)}</a>`);
    for (const a of root.match(/<a [^>]*>/g) ?? []) expect(a).toContain('tabindex="-1"');
  });
  it("writes a link that two of a station's pages share once", () => {
    const c: Content = structuredClone(content);
    c.stations = [c.stations[0]];
    const shared = c.stations[0].pages[0].links[0];
    expect(c.stations[0].pages.every((p) => p.links.some((l) => l.href === shared.href))).toBe(true);
    expect(rootHtml(c).split(`<a href="${esc(shared.href)}"`)).toHaveLength(2);
  });
  it("escapes the text it writes", () => {
    const c: Content = structuredClone(content);
    c.stations[0].heading = "A <b>&</b>";
    c.identity.name = "N & <m>";
    const html = rootHtml(c);
    expect(html).toContain("<h2>A &lt;b&gt;&amp;&lt;/b&gt;</h2>");
    expect(html).toContain(">N &amp; &lt;m&gt;</h1>");
    expect(html).not.toContain("<b>");
  });
});

describe("transformPage", () => {
  const page = transformPage(readFileSync("index.html", "utf8"), content);
  it("writes the head tags into the head and the markup into #root", () => {
    expect(page.indexOf("<title>")).toBeLessThan(page.indexOf("</head>"));
    expect(page).toContain(`<div id="root">${root}</div>`);
    expect(page).toContain('<script type="module" src="/src/main.tsx">');
  });
});

// The header says only the graduation date (#339). "Co-op" in a job title or "Two platform co-ops" is not availability, so the
// check is for the two availability phrases, not the word.
describe("availability words", () => {
  const AVAILABILITY = /full-time|open to co-op/i;
  it("the header line is the graduation date only", () => expect(identity.availability).toBe("Graduating Dec 2027."));
  it("nothing in the content module says them", () => expect(JSON.stringify(content)).not.toMatch(AVAILABILITY));
  it("nothing in the page the build writes says them", () => expect(transformPage(readFileSync("index.html", "utf8"), content)).not.toMatch(AVAILABILITY));
});

describe("index.html", () => {
  it("holds only what isn't copy", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain("<title>");
    expect(html).not.toContain(identity.name);
  });
});
