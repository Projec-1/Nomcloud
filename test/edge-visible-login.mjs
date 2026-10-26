import { chromium } from "playwright";
import { existsSync } from "fs";
import * as path from "path";
import { readdirSync } from "fs";

function findEdgeExe() {
  const localAppData = process.env.LOCALAPPDATA || path.join("C:", "Users", "abdih", "AppData", "Local");
  const programFilesX86 = process.env.ProgramFilesX86 || path.join("C:", "Program Files (x86)");
  if (existsSync(path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"))) return path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe");
  if (existsSync(path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"))) return path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe");
  const edgeAppDir = path.join(programFilesX86, "Microsoft", "Edge", "Application");
  if (existsSync(edgeAppDir)) {
    const entries = readdirSync(edgeAppDir).filter(e => /^\d+\.\d+\.\d+\.\d+$/.test(e)).sort().reverse();
    if (entries.length > 0) { const c = path.join(edgeAppDir, entries[0], "msedge.exe"); if (existsSync(c)) return c; }
  }
  console.error("No Edge executable found"); process.exit(1);
}

const edgeExe = findEdgeExe();
const profileDir = path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "User Data", "NomCloud-TestProfile-20261015-D");
console.log("Profile dir:", profileDir); console.log("Edge exe:", edgeExe);

(async () => {
  const browser = await chromium.launchPersistentContext(profileDir, {
    executablePath: edgeExe, channel: "msedge", headless: false,
    viewport: { width: 1440, height: 900 },
    args: ["--remote-debugging-port=9314", "--no-first-run", "--no-default-browser-check", "--disable-sync"]
  });
  const page = await browser.newPage();
  const msgs = [];
  page.on("console", m => msgs.push([m.type(), m.text().slice(0, 500)]));
  try {
    await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    console.log("TITLE:", await page.title());
    console.log("URL:", page.url());
    console.log("SNIPPET:", (await page.textContent("body")).slice(0, 300));
  } catch (e) { console.error("NAV_ERR:", e.message); }
  console.log("CONSOLE:", JSON.stringify(msgs.slice(0, 10)));
  console.log("BROWSER_OPEN");
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
