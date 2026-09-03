/**
 * Screenshot harness for the UX review workers.
 *
 * Node resolves `playwright` from the SCRIPT's own directory, not the working directory, so this
 * file must be COPIED next to the playwright install before use -- running it from here fails with
 * ERR_MODULE_NOT_FOUND no matter what the cwd is:
 *
 *   cp ops/ux/shoot.mjs ~/learning/NOTION-INTERVIEW-NOTES/precedence-shoot.mjs
 *   node ~/learning/NOTION-INTERVIEW-NOTES/precedence-shoot.mjs --out <dir> ...
 *
 * Flags:
 *   --out     directory for PNGs and manifest.json          (required)
 *   --routes  comma-separated paths                          (default: the main set)
 *   --widths  comma-separated viewport widths                (default: 1280)
 *   --theme   dark | light | both                            (default: dark)
 *   --full    also capture full-page shots                   (default: viewport only)
 *   --base    server origin                                  (default: http://localhost:3117)
 *
 * Writes <out>/manifest.json listing every file with the route, width, theme and any console
 * errors seen on that page. Console errors are captured because a UX problem is often a broken
 * fetch rather than a layout mistake.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);

const OUT = arg("out");
if (!OUT) {
  console.error("--out is required");
  process.exit(2);
}
const BASE = arg("base", "http://localhost:3117");
const ROUTES = arg("routes", "/,/collateral,/race,/financiers,/dashboard,/registry,/registry/new,/portfolio")
  .split(",").map((s) => s.trim()).filter(Boolean);
const WIDTHS = arg("widths", "1280").split(",").map((s) => Number(s.trim())).filter(Boolean);
const THEMES = arg("theme", "dark") === "both" ? ["dark", "light"] : [arg("theme", "dark")];
const FULL = has("full");

mkdirSync(OUT, { recursive: true });
const manifest = [];
const browser = await chromium.launch();

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    // Seed the theme before any page script runs, so nothing renders in the wrong one first.
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem("precedence-theme", t);
      } catch {}
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.classList.toggle("light", t === "light");
      });
    }, theme);

    for (const route of ROUTES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
      page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 200)));

      // Sanitise the whole route, query string included. `/race?id=x` used to yield a file
      // literally named "race?id=x__dark__1280.png": unglobbable in a shell, invalid on
      // Windows, and it broke a downstream checker that split the name at the "?".
      const slug =
        route === "/" ? "root" : route.slice(1).replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
      const stem = `${slug}__${theme}__${width}`;
      try {
        await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30000 });
        // Belt and braces: apply the class again after hydration.
        await page.evaluate((t) => document.documentElement.classList.toggle("light", t === "light"), theme);
        await page.waitForTimeout(900);

        const shots = [];
        const vp = `${stem}.png`;
        await page.screenshot({ path: join(OUT, vp) });
        shots.push(vp);
        if (FULL) {
          const fp = `${stem}__full.png`;
          await page.screenshot({ path: join(OUT, fp), fullPage: true });
          shots.push(fp);
        }
        const textLen = (await page.evaluate(() => (document.body.innerText || "").trim().length));
        manifest.push({ route, theme, width, shots, consoleErrors: errors, textChars: textLen });
        console.log(`  ${stem}  ${shots.join(" ")}${errors.length ? `  [${errors.length} console error(s)]` : ""}`);
      } catch (e) {
        manifest.push({ route, theme, width, shots: [], error: String(e).slice(0, 200), consoleErrors: errors });
        console.log(`  ${stem}  NAV FAILED: ${String(e).slice(0, 120)}`);
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.length} page captures -> ${OUT}/manifest.json`);
