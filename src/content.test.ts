import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { identity } from "./content";
import { readdirSync } from "node:fs";

import { validateContent, content, pageSwitch, ui, fill, hasPrivateAddress, stopLineText, MAX_BULLETS, type Diagram, type Page } from "./content";
import { WORK_COPY, WORK_LEADS } from "../tests/fixtures/work-copy";

const good = () => structuredClone(content);
const station = (id: string) => content.stations.find((s) => s.id === id)!;
const projectPage = (id: string) => station("projects").pages.find((p) => p.id === id)!;
// stations: 0 work, 1 projects, 2 about

describe("the page's description and preview alt text", () => {
  it("are the approved words", () => {
    expect(identity.description).toBe(
      "Adham Sedik, Software & Platform Engineer. Tour a 3D home lab: my work, MediaSafe, my home Kubernetes cluster and the AI software factory that built this site.");
    expect(identity.description).toHaveLength(159);
    expect(identity.imageAlt).toBe("The lab at night: five lit monitors and a nixie meter on a desk, with Adham Sedik's name");
  });
});

describe("validateContent", () => {
  it("accepts the shipped content", () => {
    expect(validateContent(content)).toEqual([]);
  });

  describe("missing fields", () => {
    it.each(["name", "heading"] as const)("rejects a station with no %s", (field) => {
      const c = good();
      (c.stations[1] as Record<string, unknown>)[field] = "";
      expect(validateContent(c).join("\n")).toContain(`stations[1].${field}`);
    });
    it.each([[undefined], [[]], ["pages"]])("rejects a station with no pages (%j)", (pages) => {
      const c = good();
      (c.stations[2] as Record<string, unknown>).pages = pages;
      expect(validateContent(c).join("\n")).toContain("stations[2].pages: need at least one");
    });
    it("rejects a station that has a worldLine field", () => {
      expect(content.stations.filter((s) => "worldLine" in s)).toEqual([]);
      expect(JSON.stringify(content)).not.toMatch(/world.?line/i);
    });
    it("rejects a station with no reading", () => {
      const c = good();
      delete (c.stations[0] as Record<string, unknown>).reading;
      expect(validateContent(c).join("\n")).toContain("stations[0].reading");
    });
    it("rejects a link with no href", () => {
      const c = good();
      c.stations[0].pages[0].links = [{ label: "x", href: "" }];
      expect(validateContent(c).join("\n")).toContain("stations[0].pages[0].links[0].href");
    });
    it("rejects a missing description and preview alt text", () => {
      const c = good();
      c.identity.description = "";
      c.identity.imageAlt = " ";
      const problems = validateContent(c).join("\n");
      expect(problems).toContain("identity.description");
      expect(problems).toContain("identity.imageAlt");
    });
    it("rejects missing identity", () => {
      const c = good();
      c.identity.title = " ";
      expect(validateContent(c).join("\n")).toContain("identity.title");
    });
  });

  describe("blocked content", () => {
    const withBody = (text: string) => {
      const c = good();
      c.stations[1].pages[0].body = [text];
      return validateContent(c).join("\n");
    };
    it.each([
      "Call 613-555-0142",
      "Call (613) 555 0142",
      "Call +1 613 555 0142",
      "Call 6135550142",
      "Call 613.555.0142",
    ])("blocks a phone number: %s", (t) => {
      expect(withBody(t)).toContain("phone number");
    });
    it.each(["Co-op 2024-2025", "Reading 0.000861", "Since 2022, 9 deploys"])("allows %s", (t) => {
      expect(withBody(t)).toBe("");
    });
    it.each([
      "10.0.0.5",
      "192.168.1.20",
      "172.16.4.4",
      "172.31.255.1",
      "127.0.0.1",
      "100.101.102.103",
      "169.254.1.1",
      "fd7a:115c:a1e0::1",
      "fe80::1",
      "hermit.tail1234.ts.net",
      "nas.local",
      "localhost",
    ])("blocks a private or tailnet address: %s", (t) => {
      expect(withBody(`Runs on ${t}`)).toContain("private address");
    });
    it("allows public addresses", () => {
      expect(withBody("Served at 8.8.8.8 and 172.32.0.1 and lab.mediasafe.space")).toBe("");
    });
    it("checks link hrefs and labels too", () => {
      const c = good();
      c.stations[0].pages[0].links = [{ label: "x", href: "http://192.168.1.5/admin" }];
      expect(validateContent(c).join("\n")).toContain("stations[0].pages[0].links[0].href");
    });
    it("rejects unsafe link schemes", () => {
      const c = good();
      c.stations[0].pages[0].links = [{ label: "x", href: "javascript:alert(1)" }];
      expect(validateContent(c).join("\n")).toContain("stations[0].pages[0].links[0].href");
    });
    it("checks the top-level links", () => {
      const c = good();
      c.links[0].href = "https://hermit.tail1.ts.net/";
      expect(validateContent(c).join("\n")).toContain("links[0].href");
    });
  });
});

// A count goes stale, so each says since when.
it.each([["mediasafe"], ["software-factory"]])("%s: its pull request count says since a date", (id) => {
  const bullets = projectPage(id).body;
  expect(bullets.filter((b) => /pull requests/i.test(b)).join(" ")).toMatch(/\d\+? merged pull requests since (\d+ )?[A-Z][a-z]+ 2026/);
});

// Every station has pages. Each page is a lead, at most three bullets, or a list.
describe("pages", () => {
  const ids = (id: string) => station(id).pages.map((p) => p.id);
  it.each(content.stations.flatMap((s) => s.pages.map((p) => [s.id, p.id] as const)))("%s / %s has something to show and at most three bullets", (sid, pid) => {
    const pg = station(sid).pages.find((p) => p.id === pid)!;
    expect(Boolean(pg.lead) || pg.body.length > 0 || Boolean(pg.list)).toBe(true);
    expect(pg.body.length).toBeLessThanOrEqual(MAX_BULLETS);
  });
  it("Work has Solace then Barracuda, Projects the list then Software factory, MediaSafe and Home lab, About me three pages", () => {
    expect(ids("work")).toEqual(["solace", "barracuda"]);
    expect(ids("projects")).toEqual(["list", "software-factory", "mediasafe", "home-lab"]);
    expect(ids("about")).toEqual(["why-i-do-this", "off-the-keyboard", "contact"]);
    expect(station("projects").pages.map((p) => p.label)).toEqual(["All projects", "Software factory", "MediaSafe", "Home lab"]);
    expect(station("about").pages.map((p) => p.label)).toEqual(["Why I do this", "Off the keyboard", "Contact"]);
  });
  it("only Work's job pages have dates and months", () => {
    for (const s of content.stations) for (const p of s.pages) {
      expect(p.dates !== undefined, `${s.id}/${p.id} dates`).toBe(s.id === "work");
      expect(p.months !== undefined, `${s.id}/${p.id} months`).toBe(s.id === "work");
    }
  });
  it("only Work keeps a body of its own", () => {
    expect(content.stations.filter((s) => s.body !== undefined).map((s) => s.id)).toEqual(["work"]);
  });
  it("the stations are, in order, work, projects, about, with the names the title cards show", () => {
    expect(content.stations.map((s) => s.id)).toEqual(["work", "projects", "about"]);
    expect(content.stations.map((s) => s.name)).toEqual(["Work", "Projects", "About me"]);
  });
  it("the readings are 214, 733 and 861", () => {
    expect(content.stations.map((s) => s.reading)).toEqual([214, 733, 861]);
  });
  it("Software factory links to this site's source", () => {
    expect(projectPage("software-factory").links.map((l) => l.href)).toContain("https://github.com/Joyaroin/lab");
  });
  it("rejects a page with no lead, no bullets and no list, and accepts one with only bullets", () => {
    const c = good();
    const pg = c.stations[1].pages[1];
    pg.lead = undefined;
    expect(validateContent(c)).toEqual([]);
    pg.body = [];
    expect(validateContent(c).join("\n")).toContain("stations[1].pages[1].lead: missing");
    pg.lead = "";
    expect(validateContent(c).join("\n")).toContain("stations[1].pages[1].lead: missing");
  });
  it("rejects a page with four bullets", () => {
    const c = good();
    c.stations[1].pages[1].body.push("A fourth bullet.");
    expect(validateContent(c).join("\n")).toContain("stations[1].pages[1].body: at most 3 bullets");
  });
  it("accepts a page with an empty body: the Projects list is one", () => {
    expect(station("projects").pages[0].body).toEqual([]);
    expect(validateContent(content)).toEqual([]);
  });
  it("rejects a bullet that is blank", () => {
    const c = good();
    c.stations[2].pages[1].body = [" "];
    expect(validateContent(c).join("\n")).toContain("stations[2].pages[1].body[0]: missing");
  });
  it("accepts a station with no body of its own, and checks one that has it against the pages", () => {
    expect(good().stations[1].body).toBeUndefined();
    const c = good();
    c.stations[1].body = ["Not on its page."];
    expect(validateContent(c).join("\n")).toContain("stations[1].pages: bullets must be the same as stations[1].body");
  });
  it("accepts Work with no lead of its own", () => {
    expect("lead" in good().stations[0]).toBe(false);
    expect(validateContent(good())).toEqual([]);
  });
  it("accepts a page with no dates and no months, and rejects a months that is not a whole number above 0", () => {
    const c = good();
    delete c.stations[0].pages[0].dates;
    delete c.stations[0].pages[0].months;
    expect(validateContent(c)).toEqual([]);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      const d = good();
      d.stations[0].pages[0].months = bad;
      expect(validateContent(d).join("\n")).toContain("stations[0].pages[0].months");
    }
  });
});

// The new copy, word for word from spec #280's Copy section. Existing approved copy (#165) is moved, not changed.
describe("the three stations' copy", () => {
  it("Work: the heading and the line", () => {
    expect(station("work").heading).toBe("Work experience");
    expect(station("work").line).toBe("Two platform co-ops, 16 months in all. Newest first.");
  });
  it("Projects: the heading, the list's prompt, rows with their tags, and its foot", () => {
    expect(station("projects").heading).toBe("Things I've built and run");
    const list = station("projects").pages[0].list!;
    expect(list.prompt).toBe("~/projects $ ls");
    expect(list.rows).toEqual([
      { page: "software-factory", name: "software-factory/", tag: "AI agents · CI/CD" },
      { page: "mediasafe", name: "mediasafe/", tag: "Next.js · Postgres · GitOps" },
      { page: "home-lab", name: "home-lab/", tag: "Proxmox · k3s · Cloudflare" },
    ]);
    expect(list.foot).toBe("Pick a project to open it.");
  });
  it("Projects: each project keeps its approved lead, bullets, diagram and links, and has one stat line", () => {
    expect(projectPage("software-factory").stat).toBe("100+ merged PRs since 5 November 2026");
    expect(projectPage("mediasafe").stat).toBe("170+ merged PRs since August 2026");
    expect(projectPage("home-lab").stat).toBe("No ports open at home");
    expect(projectPage("mediasafe").diagram?.steps).toEqual(["Git", "Argo CD", "Staging", "Production"]);
    expect(projectPage("home-lab").links.map((l) => l.label)).toEqual(["This site's source"]);
    expect(projectPage("mediasafe").links.map((l) => l.label)).toEqual(["MediaSafe repo", "Deploy repo", "mediasafe.space (Google sign-in)"]);
    expect(projectPage("home-lab").lead).toBe("I run my own Kubernetes cluster at home, and this site runs on it.");
    expect(projectPage("software-factory").lead).toBe("My AI software factory: I plan, and agents build, review and merge. It built this site.");
    expect(projectPage("mediasafe").lead).toBe("My tracker for shows and films, built and run by me alone. Next.js 16 and Postgres.");
  });
  it("Projects: a stat line repeats a fact the page's copy already states", () => {
    const facts: [string, RegExp][] = [["software-factory", /100\+ merged pull requests since 5 November 2026/], ["mediasafe", /170\+ merged pull requests since August 2026/], ["home-lab", /No ports are open at home/]];
    for (const [id, fact] of facts) expect(projectPage(id).body.join(" "), id).toMatch(fact);
  });
  it("Projects: Esc on a project page goes up to the list", () => {
    expect(station("projects").upToFirstPage).toBe(true);
    expect(station("work").upToFirstPage).toBeUndefined();
    expect(station("about").upToFirstPage).toBeUndefined();
  });
  it("About me: the heading, the line, the tabs, and the three pages' words", () => {
    const a = station("about");
    expect(a.heading).toBe("Hi, I'm Adham.");
    expect(a.line).toBe("Honours Computer Science, Software Engineering stream, at Carleton University in Ottawa.");
    expect(a.pages.map((p) => p.label)).toEqual(["Why I do this", "Off the keyboard", "Contact"]);
    expect(a.pages[0].lead).toBe("I'm a software and platform engineer who cares about systems that stay up and stay easy to change. Reliability and maintainability are what I build for, and security is what keeps pulling me in: every system is a puzzle about how it could break.");
    expect(a.pages[1].body).toEqual([
      "Tennis. Most weeks, on a court somewhere in Ottawa.",
      "Home lab. A Proxmox box running k3s, my Git server and CI. This site runs on it.",
    ]);
    expect(a.pages[2].body).toEqual(["I graduate in December 2027.", "I'm open to co-op and full-time roles."]);
    expect(a.pages[2].links.map((l) => l.label)).toEqual(["adhamsedik@cmail.carleton.ca", "LinkedIn", "GitHub", "This site's source", "Résumé"]);
  });
  it("the sticky notes and plates", () => {
    expect(content.stations.map((s) => s.bezel.note.replace("\n", " "))).toEqual(["Write the runbook", "Patch the cluster", "Court at 7"]);
    expect(content.stations.map((s) => s.bezel.plate)).toEqual(["HALDEN HX-214", "HALDEN HX-418", "HALDEN HX-607"]);
  });
  it("no retired station name is a station any more", () => {
    expect(content.stations.map((s) => s.name)).not.toEqual(expect.arrayContaining(["MediaSafe"]));
    for (const old of ["MediaSafe", "Home lab", "Software factory", "Contact"]) expect(content.stations.some((s) => s.name === old), old).toBe(false);
    expect(content.stations.some((s) => ["377", "512"].includes(String(s.reading)))).toBe(false);
  });
  it("rejects a station line that is blank, and a stat that is blank or a phone number", () => {
    const c = good();
    c.stations[0].line = " ";
    c.stations[1].pages[1].stat = "Call 613-555-0142";
    const problems = validateContent(c).join("\n");
    expect(problems).toContain("stations[0].line: missing");
    expect(problems).toContain("stations[1].pages[1].stat: looks like a phone number");
  });
  it("rejects a list that is missing a part, or has a row for a page that isn't there or has no stat", () => {
    const c = good();
    const list = c.stations[1].pages[0].list!;
    list.prompt = "";
    list.foot = "";
    list.rows[0].tag = "";
    list.rows[1].page = "nope";
    delete c.stations[1].pages[3].stat;
    const problems = validateContent(c).join("\n");
    expect(problems).toContain("pages[0].list.prompt: missing");
    expect(problems).toContain("pages[0].list.foot: missing");
    expect(problems).toContain("pages[0].list.rows[0].tag: missing");
    expect(problems).toContain('pages[0].list.rows[1].page: no page "nope"');
    expect(problems).toContain('pages[0].list.rows[2].page: "home-lab" has no stat');
  });
  it("rejects a list with no rows", () => {
    const c = good();
    c.stations[1].pages[0].list!.rows = [];
    expect(validateContent(c).join("\n")).toContain("list.rows: missing");
  });
});

it("has no placeholder copy left", () => {
  expect(JSON.stringify(content)).not.toMatch(/placeholder/i);
});

// The title card on each TV is the station's name. Nothing on a TV may read as live.
describe("title card text", () => {
  it("rejects a name that reads as a live status", () => {
    for (const line of ["hamon Ready", "Synced", "42 passing", "build OK", "3 pods Running"]) {
      const c = good();
      c.stations[0].name = line;
      expect(validateContent(c).join("\n")).toContain("stations[0].name: reads as a live status");
    }
  });
});

// A station's optional diagram is held as data and checked like other copy.
describe("diagram", () => {
  const media = () => {
    const c = good();
    return { c, d: c.stations[1].pages.find((p) => p.id === "mediasafe")!.diagram! };
  };
  it("MediaSafe has one: Git to Argo CD to staging, then production by hand", () => {
    const { d } = media();
    expect(d.steps).toEqual(["Git", "Argo CD", "Staging", "Production"]);
    expect(d.hops).toEqual(["", "every merge", "by hand"]);
  });
  it("hops that are not a list are reported, not a crash", () => {
    for (const bad of ["by hand", { length: 2 }, null, 7]) {
      const { c, d } = media();
      (d as { hops: unknown }).hops = bad;
      expect(validateContent(c).join("\n")).toContain("diagram.hops");
    }
  });
  // Whole words, so "automatic" does not pass for "automatically". Only plain connectives are free.
  const diagramText = (d: Diagram) => [d.description, ...d.steps, ...d.hops];
  const FREE = new Set(["a", "an", "the", "to", "and", "by", "from", "is", "are", "with", "which"]);
  const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  /** Words in a page's diagram that its copy doesn't have, as "word in text". */
  const missingWords = (s: Pick<Page, "body" | "diagram"> & { heading: string; name: string; lead?: string }) => {
    const copy = new Set(words((s.lead ?? "") + " " + s.body.join(" ") + " " + s.heading + " " + s.name));
    return diagramText(s.diagram!).flatMap((t) => words(t).filter((w) => !FREE.has(w) && !copy.has(w)).map((w) => `"${w}" in "${t}"`));
  };
  const withDiagram = station("projects").pages.filter((p) => p.diagram).map((p) => [p.id]);
  const pageOf = projectPage;
  it.each(withDiagram)("%s: every word of its diagram, description included, is in its copy", (id) => {
    const st = station("projects");
    expect(missingWords({ ...pageOf(id), heading: st.heading, name: st.name + " " + pageOf(id).label })).toEqual([]);
  });
  it("the word check counts the lead as copy", () => {
    const s = { lead: "Plan first.", body: ["x"], heading: "h", name: "n", diagram: { description: "Plan", steps: ["Plan"], hops: [] } };
    expect(missingWords(s)).toEqual([]);
    expect(missingWords({ ...s, lead: undefined })).toEqual(['"plan" in "Plan"', '"plan" in "Plan"']);
  });
  it("the word check does not pass a near miss", () => {
    const s = { body: ["It deploys automatically."], heading: "h", name: "n", diagram: { description: "It deploys", steps: ["automatic"], hops: [] } };
    expect(missingWords({ ...s, diagram: { ...s.diagram, steps: ["automatically"] } })).toEqual([]);
    expect(missingWords(s)).toEqual(['"automatic" in "automatic"']);
  });
  it("exactly the Software factory, MediaSafe and Home lab pages have one; no other page does", () => {
    expect(content.stations.flatMap((s) => s.pages.filter((p) => p.diagram).map((p) => `${s.id}/${p.id}`)))
      .toEqual(["projects/software-factory", "projects/mediasafe", "projects/home-lab"]);
  });
  describe.each(withDiagram)("%s", (id) => {
    it("is checked for live-status words like the other copy", () => {
      const c = good();
      c.stations[1].pages.find((p) => p.id === id)!.diagram!.steps[0] = "passing";
      expect(validateContent(c).join("\n")).toMatch(/diagram\.steps\[0\]: reads as a live status/);
    });
    it("shows no score, leaderboard or result", () => {
      expect(diagramText(pageOf(id).diagram!).join(" ")).not.toMatch(/score|leader|\d+\s*[-:–]\s*\d+|win|goal|result/i);
    });
  });
  it("a station without one is still valid", () => {
    const c = good();
    delete c.stations[1].pages[2].diagram;
    expect(validateContent(c)).toEqual([]);
  });
  it.each(["description", "step", "hop"])("checks the %s text like other copy", (what) => {
    const { c, d } = media();
    const bad = "Call 613-555-0142";
    if (what === "description") d.description = bad;
    if (what === "step") d.steps[1] = "10.0.0.5";
    if (what === "hop") d.hops[2] = bad;
    expect(validateContent(c).join("\n")).toMatch(/diagram/);
  });
  it("rejects a missing description, since a screen reader needs one", () => {
    const { c, d } = media();
    d.description = "";
    expect(validateContent(c).join("\n")).toContain("diagram.description");
  });
  it("rejects hops that do not fit the steps", () => {
    const { c, d } = media();
    d.hops.pop();
    expect(validateContent(c).join("\n")).toContain("diagram.hops");
  });
  it("rejects a step that reads as a live status", () => {
    const { c, d } = media();
    d.steps[2] = "Synced";
    expect(validateContent(c).join("\n")).toContain("reads as a live status");
  });
});

// Work is two pages, Barracuda then Solace on the timeline, holding exactly the approved text.
describe("Work's pages", () => {
  const work = () => { const c = good(); return { c, w: c.stations.find((s) => s.id === "work")! }; };
  it("are Solace and Barracuda, and between them hold every bullet of the body in order", () => {
    const { w } = work();
    expect(w.pages.map((p) => p.label)).toEqual(["Solace", "Barracuda"]);
    expect(w.pages.map((p) => p.dates)).toEqual(["Sep to Dec 2026", "Sep 2025 to Aug 2026"]);
    expect(w.pages.map((p) => p.months)).toEqual([4, 12]);
    expect(w.pages.map((p) => p.lead)).toEqual(WORK_LEADS);
    expect(w.pages.flatMap((p) => p.body)).toEqual(WORK_COPY); // the approved wording, pinned in a fixture
    expect(w.body).toEqual(WORK_COPY);
  });
  it("rejects a page with no months, when the station's pages must add up and one has none left", () => {
    const { c, w } = work();
    w.pages[1].months = 0;
    expect(validateContent(c).join("\n")).toContain("pages[1].months");
  });
  it("rejects a Work page with no bullets, since its pages must add up to the body", () => {
    const { c, w } = work();
    w.pages[1].body = [];
    expect(validateContent(c).join("\n")).toContain("stations[0].pages: bullets must be the same");
  });
  it("rejects pages whose paragraphs differ from the station's text, or are out of order", () => {
    const { c, w } = work();
    w.pages[0].body = [...w.pages[0].body].reverse();
    expect(validateContent(c).join("\n")).toContain("stations[0].pages: bullets must be the same");
    const o = work();
    o.w.pages.reverse();
    expect(validateContent(o.c).join("\n")).toContain("pages: bullets must be the same");
  });
  it.each(["label", "dates"] as const)("rejects a page %s that reads as a live status", (f) => {
    const { c, w } = work();
    w.pages[0][f] = "Synced";
    expect(validateContent(c).join("\n")).toContain(`pages[0].${f}: reads as a live status`);
  });
  it("rejects a page with a phone number in it", () => {
    const { c, w } = work();
    w.pages[0].body[0] = "Call 613-555-0142";
    expect(validateContent(c).join("\n")).toContain("pages[0].body[0]");
  });
});

// Each TV's bezel carries a maker's plate and a sticky note. Both are drawn on a TV, so neither may
// read as a status or result, and no two TVs share a note.
describe("bezel words", () => {
  it.each(["plate", "note"] as const)("rejects a %s that reads as a live status", (field) => {
    for (const line of ["All Synced", "42 passing", "build OK", "Running"]) {
      const c = good();
      c.stations[0].bezel[field] = line;
      expect(validateContent(c).join("\n")).toContain(`stations[0].bezel.${field}: reads as a live status`);
    }
  });
  it.each(["plate", "note"] as const)("rejects a station with no %s", (field) => {
    const c = good();
    c.stations[0].bezel[field] = "";
    expect(validateContent(c).join("\n")).toContain(`stations[0].bezel.${field}: missing`);
  });
  it("gives every TV its own plate and note", () => {
    for (const f of ["plate", "note"] as const) {
      const all = content.stations.map((s) => s.bezel[f]);
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

// The timeline's own words are drawn on a TV too, so they are checked like the rest. The words come
// from the Content given, so every key it holds is validated, including ones added later.
describe("timeline words", () => {
  it.each(Object.keys(pageSwitch))("rejects a %s that is empty or reads as live", (f) => {
    const c = good();
    c.pageSwitch[f as keyof typeof pageSwitch] = "";
    expect(validateContent(c).join("\n")).toContain(`pageSwitch.${f}: missing`);
    c.pageSwitch[f as keyof typeof pageSwitch] = "Synced";
    expect(validateContent(c).join("\n")).toContain(`pageSwitch.${f}: reads as a live status`);
  });
  it("validates a key added to the timeline words", () => {
    const c = good();
    (c.pageSwitch as Record<string, string>).extra = "";
    expect(validateContent(c).join("\n")).toContain("pageSwitch.extra: missing");
  });
});

// Every other word the app shows or announces: the HUD, the meter's labels, the boot log, the signal
// lost screen, the gap's sentence. They move here from the components, so validation covers them.
describe("interface words", () => {
  const EMPTY_GROUPS = ["pageControls", "photo"];
  const GROUPS = [...EMPTY_GROUPS, "hud", "pins", "ambient"];
  const keys = Object.keys(ui).filter((k) => !GROUPS.includes(k));
  it("accepts the shipped words", () => {
    expect(validateContent(content)).toEqual([]);
  });
  it.each(keys)("rejects %s when it is removed or empty", (k) => {
    const c = good();
    delete (c.ui as unknown as Record<string, string>)[k];
    expect(validateContent(c).join("\n")).toContain(`ui.${k}: missing`);
    (c.ui as unknown as Record<string, string>)[k] = " ";
    expect(validateContent(c).join("\n")).toContain(`ui.${k}: missing`);
  });
  it.each(EMPTY_GROUPS)("has an empty %s group for a later ticket, which validateContent walks", (g) => {
    const group = (ui as Record<string, unknown>)[g];
    expect(group).toEqual({});
    const c = good();
    delete (c.ui as Record<string, unknown>)[g];
    expect(validateContent(c).join("\n")).toContain(`ui.${g}: missing`);
    (c.ui as Record<string, unknown>)[g] = { added: " ", phone: "Call 613-555-0142" };
    const problems = validateContent(c).join("\n");
    expect(problems).toContain(`ui.${g}.added: missing`);
    expect(problems).toContain(`ui.${g}.phone: looks like a phone number`);
  });
  describe("the Start button's words (#285)", () => {
    it("are the approved words", () => {
      expect(ui.hud).toEqual({
        start: "Start the tour", startCount: "· 3 monitors", startOrLandscape: "or click a monitor", startOrPortrait: "or pick one below",
      });
    });
    it.each(Object.keys(ui.hud))("rejects %s when it is removed or empty", (k) => {
      const c = good();
      delete (c.ui.hud as Record<string, string>)[k];
      expect(validateContent(c).join("\n")).toContain(`ui.hud.${k}: missing`);
      (c.ui.hud as Record<string, string>)[k] = " ";
      expect(validateContent(c).join("\n")).toContain(`ui.hud.${k}: missing`);
    });
    it("is walked by validateContent: removed, it is missing", () => {
      const c = good();
      delete (c.ui as Record<string, unknown>).hud;
      expect(validateContent(c).join("\n")).toContain("ui.hud: missing");
    });
  });
  describe("the pins' words (#293)", () => {
    it("are the approved words, one per station", () => {
      expect(ui.pins).toEqual({ work: "1 Work", projects: "2 Projects", about: "3 About me" });
    });
    it.each(Object.keys(ui.pins))("rejects %s when it is removed or empty", (k) => {
      const c = good();
      delete (c.ui.pins as Record<string, string>)[k];
      expect(validateContent(c).join("\n")).toContain(`ui.pins.${k}: missing`);
      (c.ui.pins as Record<string, string>)[k] = " ";
      expect(validateContent(c).join("\n")).toContain(`ui.pins.${k}: missing`);
    });
    it("is walked by validateContent: removed, it is missing", () => {
      const c = good();
      delete (c.ui as Record<string, unknown>).pins;
      expect(validateContent(c).join("\n")).toContain("ui.pins: missing");
    });
  });
  describe("the ambient screens' words (#290)", () => {
    const ambient = ui.ambient as Record<string, string>;
    const withAmbient = (f: (a: Record<string, string>) => void) => {
      const c = good();
      f(c.ui.ambient as Record<string, string>);
      return validateContent(c).join("\n");
    };
    it("are the approved words", () => {
      expect(ambient).toEqual({
        gitlogCommand: "$ git log --oneline",
        tunnel: "Tunnel", proxmox: "Proxmox", k3s: "k3s",
        trafficCaption: "internet → home lab",
        wordReliable: "RELIABLE", wordMaintainable: "MAINTAINABLE", wordSecure: "SECURE",
        puzzleDecoding: "[ decoding… ]", puzzleSolved: "[ solved ]",
      });
    });
    it.each(Object.keys(ambient))("rejects %s when it is removed, empty or reads as a live status", (k) => {
      expect(withAmbient((a) => { delete a[k]; })).toContain(`ui.ambient.${k}: missing`);
      expect(withAmbient((a) => { a[k] = " "; })).toContain(`ui.ambient.${k}: missing`);
      expect(withAmbient((a) => { a[k] = "Healthy"; })).toContain(`ui.ambient.${k}: reads as a live status`);
    });
    it("checks a word added to the group, for a phone number too", () => {
      const problems = withAmbient((a) => { a.added = "42 passing"; a.phone = "Call 613-555-0142"; });
      expect(problems).toContain("ui.ambient.added: reads as a live status");
      expect(problems).toContain("ui.ambient.phone: looks like a phone number");
    });
    it("rejects a missing group", () => {
      const c = good();
      delete (c.ui as Record<string, unknown>).ambient;
      expect(validateContent(c).join("\n")).toContain("ui.ambient: missing");
    });
  });
  it("exports hasPrivateAddress", () => {
    expect(hasPrivateAddress("10.0.0.5")).toBe(true);
    expect(hasPrivateAddress("lab.mediasafe.space")).toBe(false);
  });
  it("rejects a missing ui block, not a crash", () => {
    const c = good();
    delete (c as Partial<typeof c>).ui;
    expect(validateContent(c).join("\n")).toContain("ui.room: missing");
  });
  it("rejects a template that lost its placeholder", () => {
    const c = good();
    c.ui.gapBehind = "{n} deploys behind";
    expect(validateContent(c).join("\n")).toContain("ui.gapBehind: must contain {noun}");
  });
  it("has the words the stop controls use", () => {
    expect([ui.keyPrev, ui.keyRoom, ui.keyNext, ui.keyStart]).toEqual(["PREV", "ROOM", "NEXT", "START"]);
    expect([ui.prevStation, ui.backToRoom, ui.nextStation, ui.startTour]).toEqual(
      ["Previous page", "Back to the overview", "Next page", "Start the tour"]);
    expect(fill(ui.stopLine, { station: "Work", page: "Solace", n: 1, total: 3 })).toBe("Work · Solace · 1 of 3");
    expect(fill(ui.listStopLine, { station: "Projects", n: 2, total: 3 })).toBe("Projects · 2 of 3");
    expect(fill(ui.stationTitle, { page: "Solace", station: "Work", name: "Adham Sedik" })).toBe("Solace · Work · Adham Sedik");
    expect(fill(ui.listTitle, { station: "Projects", name: "Adham Sedik" })).toBe("Projects · Adham Sedik");
  });
  it("the line under the meter names the page, and the Projects list has none", () => {
    const [work, projects] = content.stations;
    expect(stopLineText(work, work.pages[0], 1, 3)).toBe("Work · Solace · 1 of 3");
    expect(stopLineText(projects, projects.pages[0], 2, 3)).toBe("Projects · 2 of 3");
    expect(stopLineText(projects, projects.pages[2], 2, 3)).toBe("Projects · MediaSafe · 2 of 3");
  });
  it.each([
    ["stopLine", ["station", "page", "n", "total"]], ["listStopLine", ["station", "n", "total"]],
    ["stationTitle", ["page", "station", "name"]], ["listTitle", ["station", "name"]],
  ] as const)("rejects %s without a placeholder", (key, phs) => {
    for (const ph of phs) {
      const c = good();
      c.ui[key] = c.ui[key].replace(`{${ph}}`, "x");
      expect(validateContent(c).join("\n")).toContain(`ui.${key}: must contain {${ph}}`);
    }
  });
  it("says the gap in the new sentence", () => {
    expect(fill(ui.gapBehind, { n: 9, noun: "deploys" })).toBe("MediaSafe: 9 staging deploys since the last prod release");
    expect(fill(ui.gapBehindAtLeast, { n: 9, noun: "deploys" })).toBe("MediaSafe: at least 9 staging deploys since the last prod release");
  });
  it("says the gap in the short form for a short window", () => {
    expect(fill(ui.gapBehindShort, { n: 9, noun: "deploys" })).toBe("MediaSafe: 9 deploys ahead of prod");
    expect(fill(ui.gapBehindAtLeastShort, { n: 9, noun: "deploys" })).toBe("MediaSafe: 9+ deploys ahead of prod");
  });
  it.each(["gapBehindShort", "gapBehindAtLeastShort"] as const)("rejects %s without {n} or {noun}", (k) => {
    for (const ph of ["n", "noun"]) {
      const c = good();
      c.ui[k] = c.ui[k].replace(`{${ph}}`, "x");
      expect(validateContent(c).join("\n")).toContain(`ui.${k}: must contain {${ph}}`);
    }
  });
  it("blocks a phone number in them like other copy", () => {
    const c = good();
    c.ui.room = "Call 613-555-0142";
    expect(validateContent(c).join("\n")).toContain("ui.room: looks like a phone number");
  });
  it("fill puts values in their placeholders", () => {
    expect(fill("a {x} b {y}", { x: "1", y: "2" })).toBe("a 1 b 2");
  });
  it("keeps the words visitors saw before", () => {
    expect(ui.room).toBe("Overview");
    expect(ui.more).toBe("more ▾");
    expect(ui.readingPending).toBe("reading prod and staging…");
    expect(fill(ui.meterReading, { digits: "0.000214" })).toBe("Reading 0.000214");
    expect([ui.loadProgress, ui.bootLog, ui.signalLost]).toEqual(["Load progress", "Boot log", "SIGNAL LOST"]);
    expect(fill(ui.logDone, { step: ui.stepCode })).toBe("[ ok ] room code");
    expect(fill(ui.logPending, { step: ui.stepScene })).toBe("[ .. ] room scene");
    expect(ui.logPowerOn).toBe("[ ok ] meter power-on");
    expect(ui.stepCapability).toBe("capability check");
  });
});

// No copy sits in app code outside the content module: no component or helper holds one of these
// words as a quoted string or as text between tags.
describe("no copy outside the content module", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== "content.ts" ? [`${dir}/${e.name}`] : []);
  const sources = files("src").map((f) => [f, readFileSync(f, "utf8")] as const);
  const words = [...Object.values(ui), ...Object.values(identity)].filter((w): w is string => typeof w === "string" && w.length >= 4);
  it("finds the source files", () => expect(sources.length).toBeGreaterThan(15));
  it.each(sources)("%s", (_f, src) => {
    for (const w of words) {
      for (const q of ['"', "'", "`"]) expect(src, w).not.toContain(`${q}${w}${q}`);
      expect(src, w).not.toContain(`>${w}<`);
    }
  });
});

describe("the pull request count", () => {
  it("says 100+ in Software factory's last bullet, and nothing says 76", () => {
    const factory = projectPage("software-factory");
    expect(factory.body.at(-1)).toContain("This site has 100+ merged pull requests since 5 November 2026.");
    expect(JSON.stringify(content)).not.toMatch(/\b76\b/);
  });
});

describe("station readings", () => {
  const readings = content.stations.map((s) => s.reading);
  it("are not numbers from the series", () => {
    // A few well-known divergence readings, as six-decimal strings.
    const series = ["0.337187", "0.571024", "0.456903", "0.523299", "0.409431", "1.048596", "1.130426"];
    for (const r of readings) expect(series).not.toContain((r / 1e6).toFixed(6));
  });
  it("are distinct, so each station is identifiable", () => {
    expect(new Set(readings).size).toBe(readings.length);
  });
});
