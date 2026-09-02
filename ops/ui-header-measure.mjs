import { chromium } from "playwright";
const b = await chromium.launch();
for (const width of [768, 900, 1024, 1200, 1280, 1440, 1536, 1700]) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3117/collateral", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const h = document.querySelector("header");
    if (!h) return null;
    const kids = [...h.children].map((c) => ({
      tag: c.tagName.toLowerCase(),
      w: Math.round(c.getBoundingClientRect().width),
      txt: (c.innerText || "").replace(/\s+/g, " ").trim().slice(0, 46),
    }));
    const nav = h.querySelector("nav");
    const navKids = nav ? [...nav.children].map((c) => ({
      t: (c.innerText || "").trim(), w: Math.round(c.getBoundingClientRect().width),
    })) : [];
    const right = h.children[2];
    const rightKids = right ? [...right.children].map((c) => ({
      t: (c.innerText || "").replace(/\s+/g," ").trim().slice(0, 20),
      w: Math.round(c.getBoundingClientRect().width),
    })) : [];
    return {
      headerScroll: h.scrollWidth, viewport: window.innerWidth,
      pageScroll: document.documentElement.scrollWidth,
      kids, navKids, rightKids,
      navW: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
    };
  });
  const sum = r.kids.reduce((n, k) => n + k.w, 0);
  const gaps = 6 * 24 + 2 * 24; // gap-6 between 3 children + px-6 padding
  console.log(`\n=== ${width}px  (page scrollWidth ${r.pageScroll}${r.pageScroll > width ? "  ❌ OVERFLOW +" + (r.pageScroll - width) : "  ✓"}) ===`);
  console.log(`  children: ${r.kids.map((k) => `${k.tag}=${k.w}`).join("  ")}   sum=${sum}  +padding/gaps≈${sum + gaps}`);
  console.log(`  nav (${r.navW}px): ${r.navKids.map((k) => `${k.t}:${k.w}`).join(" ")}`);
  console.log(`  right: ${r.rightKids.map((k) => `${k.t || "·"}:${k.w}`).join("  ")}`);
  await ctx.close();
}
await b.close();
