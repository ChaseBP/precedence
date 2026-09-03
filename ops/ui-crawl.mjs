import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3117";
const OUT = "/home/raven_bp/projects/ctc/analysis/ui/shots";
mkdirSync(OUT, { recursive: true });

// /agents, /deals and /history were orphan re-exports of other pages and are deleted.
//
// `/race` WITHOUT an id renders a resolver, not the race console — so crawling it tested a much
// simpler page and reported the console as clean while it overflowed by ~1000px at every width.
// Pass RACE_ID to crawl the real thing; without it, the console is NOT covered and the run says so.
const RACE_ID = process.env.RACE_ID;
const ROUTES = ["/", "/collateral", "/collateral/col-8802", "/financiers", "/dashboard",
                "/registry", "/registry/new", "/portfolio",
                RACE_ID ? `/race?id=${RACE_ID}` : "/race"];
if (!RACE_ID) {
  console.log("WARNING: RACE_ID not set — crawling /race bare, which does NOT exercise the race console.\n");
}
// Breakpoint boundaries on purpose: Tailwind sm/md/lg/xl/2xl are 640/768/1024/1280/1536.
const WIDTHS = [360, 414, 639, 640, 767, 768, 1023, 1024, 1279, 1280, 1535, 1536, 1920];

const findings = [];
const browser = await chromium.launch();

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 200)));
    let status = 0;
    try {
      const r = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30000 });
      status = r?.status() ?? 0;
      await page.waitForTimeout(700);
    } catch (e) {
      findings.push({ route, width, kind: "NAV_FAIL", detail: String(e).slice(0, 160) });
      await page.close();
      continue;
    }

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      // Which elements actually stick out past the viewport?
      const over = [];
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > window.innerWidth + 1.5) {
          over.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && String(el.className)).slice(0, 90),
            right: Math.round(r.right),
          });
        }
      }
      const text = document.body.innerText || "";
      const broke = [
        "This page couldn't load",
        "This page couldn\u2019t load",
        "Application error",
        "Unhandled Runtime Error",
        "ChunkLoadError",
        "500",
      ].find((needle) => text.includes(needle) && text.length < 400);

      return {
        errorPage: broke ?? null,
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        bodyText: (document.body.innerText || "").trim().length,
        overflowing: over.slice(0, 6),
        overflowCount: over.length,
      };
    });

    if (status >= 400) findings.push({ route, width, kind: "HTTP", detail: `status ${status}` });
    if (m.scrollWidth > m.clientWidth + 1) {
      findings.push({ route, width, kind: "PAGE_H_OVERFLOW",
        detail: `scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth} (+${m.scrollWidth - m.clientWidth}px); ${m.overflowCount} el(s); first: ${JSON.stringify(m.overflowing.slice(0,3))}` });
    }
    if (m.bodyText < 40) findings.push({ route, width, kind: "BLANK", detail: `only ${m.bodyText} chars of text` });
    // Next's own error page renders ~60 characters of text, so it sails past the blank check. A
    // broken chunk once produced a page reading "This page couldn't load" that this crawl scored
    // as healthy — check for the error boundary explicitly, not just for emptiness.
    if (m.errorPage) {
      findings.push({ route, width, kind: "ERROR_PAGE", detail: `Next error boundary rendered: ${m.errorPage}` });
    }
    for (const e of errors) findings.push({ route, width, kind: "CONSOLE", detail: e });

    // Screenshot a representative set of widths only, to keep the output reviewable.
    if ([360, 768, 1280, 1920].includes(width)) {
      const name = route === "/" ? "root" : route.slice(1).replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
      await page.screenshot({ path: `${OUT}/${name}@${width}.png`, fullPage: true });
    }
    await page.close();
  }
  await ctx.close();
  console.log(`width ${width} done`);
}
await browser.close();

writeFileSync(`${OUT}/../crawl-findings.json`, JSON.stringify(findings, null, 2));
const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
console.log("\n=== TOTALS ===");
console.log(JSON.stringify(byKind, null, 2));
console.log(`\n${findings.length} finding(s) -> analysis/ui/crawl-findings.json`);
