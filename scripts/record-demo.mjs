import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const rawDir = path.join(root, "artifacts", "raw-video");
const outDir = path.join(root, "artifacts");
const mp4 = path.join(outDir, "benchmark-demo.mp4");
const screenshot = path.join(outDir, "screenshot_dashboard.png");
const baseUrl = "http://127.0.0.1:4173/cursor-try/?demo=1&fresh=1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const probe = "http://127.0.0.1:4173/cursor-try/";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(probe);
      if (response.ok) return;
    } catch {
      // preview is still booting
    }
    await sleep(200);
  }
  throw new Error("preview server did not start");
}

async function probe(file) {
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,pix_fmt,width,height:format=duration",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(stdout);
}

await exec("npm", ["run", "build"], { cwd: root });

const preview = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4173",
    "--strictPort",
  ],
  { cwd: root, stdio: "inherit" },
);

let failed = false;
try {
  await waitForServer();
  await rm(rawDir, { recursive: true, force: true });
  await mkdir(rawDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    args: ["--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: rawDir, size: { width: 1280, height: 720 } },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.getByTestId("app-ready").waitFor();
  await page.getByTestId("demo-banner").waitFor();
  await page.getByTestId("share-card").waitFor();
  await sleep(2000);

  await page.getByTestId("model-llama").click();
  await sleep(700);
  await page.getByTestId("model-gemma").click();
  await sleep(700);
  await page.getByTestId("model-phi").click();
  await sleep(700);
  await page.getByTestId("model-qwen").click();
  await sleep(900);
  await page.getByTestId("run-benchmark").click();
  await page
    .locator('[data-testid="run-complete"][data-state="complete"]')
    .waitFor({ timeout: 30000 });
  await sleep(2000);
  await page.screenshot({ path: screenshot });
  await page.getByTestId("chart-section").hover();
  await sleep(1600);

  const downloadPromise = page
    .waitForEvent("download", { timeout: 8000 })
    .catch(() => null);
  await page.getByTestId("export-png").click();
  const download = await downloadPromise;
  if (download) {
    await download.saveAs(path.join(outDir, "share-card.png")).catch(() => {});
  }
  await page.getByTestId("export-status").waitFor();
  await sleep(2200);

  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video.path();

  await exec("ffmpeg", [
    "-y",
    "-i",
    raw,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-preset",
    "veryfast",
    "-movflags",
    "+faststart",
    "-r",
    "30",
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x1a1814",
    mp4,
  ]);

  const info = await probe(mp4);
  const stream = info.streams?.[0] ?? {};
  const duration = Number(info.format?.duration ?? 0);
  console.log(
    JSON.stringify(
      {
        duration,
        codec: stream.codec_name,
        pix_fmt: stream.pix_fmt,
        width: stream.width,
        height: stream.height,
        mp4,
        screenshot,
      },
      null,
      2,
    ),
  );
  if (stream.codec_name !== "h264" || stream.pix_fmt !== "yuv420p") {
    throw new Error("MP4 is not H.264 yuv420p");
  }
  if (stream.width !== 1280 || stream.height !== 720) {
    throw new Error(`Unexpected size ${stream.width}x${stream.height}`);
  }
  if (!(duration >= 15 && duration <= 45)) {
    throw new Error(`MP4 duration ${duration.toFixed(2)}s is outside 15–45s`);
  }
} catch (error) {
  failed = true;
  console.error(error);
  process.exitCode = 1;
} finally {
  preview.kill("SIGTERM");
  process.exit(failed ? 1 : 0);
}
