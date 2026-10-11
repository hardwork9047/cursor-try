import { spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./lib/catalog.mjs";
import { renderGallery } from "./lib/gallery.mjs";
import { SITE_BASE, SITE_REPO } from "./lib/site.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const STATIC_SKIP = new Set([
  "demo.json",
  "README.md",
  "package.json",
  "package-lock.json",
  ".gitignore",
]);

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`\`${command} ${args.join(" ")}\` が終了コード ${code} で失敗しました。`));
    });
  });
}

function assertPaths(html, slug, requireOwnBase) {
  const own = `${SITE_BASE}${slug}/`;
  const urls = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const url of urls) {
    if (!url.startsWith("/") || url.startsWith("//")) continue;
    if (!url.startsWith(SITE_BASE)) {
      throw new Error(`絶対パス ${url} は ${SITE_BASE} から始めてください。`);
    }
  }
  if (requireOwnBase && !html.includes(own)) {
    throw new Error(
      `ビルド結果に ${own} がありません。vite の base を /${SITE_REPO}/${slug}/ にしてください。`,
    );
  }
}

async function copyStatic(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    if (STATIC_SKIP.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    await cp(from, to, { recursive: entry.isDirectory() });
  }
  try {
    await stat(path.join(dest, "index.html"));
  } catch {
    throw new Error("静的デモには index.html が必要です。");
  }
}

async function buildDemo(demo) {
  const dest = path.join(dist, demo.slug);
  if (demo.hasPackage) {
    const pkg = JSON.parse(await readFile(path.join(demo.dir, "package.json"), "utf8"));
    if (!pkg.scripts || typeof pkg.scripts.build !== "string") {
      throw new Error("package.json に scripts.build がありません。");
    }
    try {
      await stat(path.join(demo.dir, "package-lock.json"));
    } catch {
      throw new Error(
        "package-lock.json がありません。そのデモのフォルダで npm install し、lock をコミットしてください。",
      );
    }
    console.log(`\n[build] demos/${demo.slug} をビルドします`);
    await run("npm", ["ci"], demo.dir);
    await run("npm", ["run", "build"], demo.dir);
    const built = path.join(demo.dir, "dist");
    const indexPath = path.join(built, "index.html");
    let html;
    try {
      html = await readFile(indexPath, "utf8");
    } catch {
      throw new Error("ビルド後の dist/index.html がありません。");
    }
    assertPaths(html, demo.slug, true);
    await cp(built, dest, { recursive: true });
    return;
  }

  console.log(`\n[build] demos/${demo.slug} を静的ファイルとしてコピーします`);
  await copyStatic(demo.dir, dest);
  const html = await readFile(path.join(dest, "index.html"), "utf8");
  assertPaths(html, demo.slug, false);
}

let catalog;
try {
  catalog = await loadCatalog(root);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
if (catalog.demos.length === 0) {
  console.error("demos/ に公開できるデモがありません。");
  process.exit(1);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const failures = [];
for (const demo of catalog.demos) {
  try {
    await buildDemo(demo);
    console.log(`[ok] ${demo.slug}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ slug: demo.slug, message });
    console.error(`[fail] demos/${demo.slug}\n${message}`);
  }
}

if (failures.length > 0) {
  console.error("\n次のデモが失敗したため、サイトは公開しません。");
  for (const failure of failures) {
    console.error(`- demos/${failure.slug}: ${failure.message}`);
  }
  await rm(dist, { recursive: true, force: true });
  process.exit(1);
}

await writeFile(path.join(dist, "index.html"), renderGallery(catalog), "utf8");
await cp(path.join(root, "gallery/favicon.svg"), path.join(dist, "favicon.svg"));

console.log(`\n[ok] dist/ にギャラリーと ${catalog.demos.length} 件のデモを出しました。`);
