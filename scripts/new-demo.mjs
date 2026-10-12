import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function usage() {
  console.error(`使い方: npm run new-demo -- <slug> [--template static|vite]

  static  一枚の HTML（既定）。フレームワークは要りません。
  vite    Vite + React + TypeScript。package-lock.json を作ります。

slug は小文字・数字・ハイフンです。例: pallet-count`);
  process.exit(1);
}

function missing(error) {
  return error && error.code === "ENOENT";
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) usage();

let template = "static";
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--template") {
    template = args[i + 1];
    i += 1;
    if (!template) usage();
  } else if (arg.startsWith("--template=")) {
    template = arg.slice("--template=".length);
  } else if (arg.startsWith("-")) {
    console.error(`未知のオプションです: ${arg}`);
    usage();
  } else {
    positional.push(arg);
  }
}

if (positional.length !== 1) usage();
const slug = positional[0];
if (!SLUG.test(slug)) {
  console.error("slug は小文字・数字・ハイフンだけにしてください。例: pallet-count");
  process.exit(1);
}
if (template !== "static" && template !== "vite") {
  console.error("template は static または vite です。");
  process.exit(1);
}

const dest = path.join(root, "demos", slug);
try {
  await stat(dest);
  console.error(`demos/${slug} は既にあります。`);
  process.exit(1);
} catch (error) {
  if (!missing(error)) throw error;
}
try {
  await stat(path.join(root, "tools", slug));
  console.error(`tools/${slug} があるため、同じ名前のデモは作れません。`);
  process.exit(1);
} catch (error) {
  if (!missing(error)) throw error;
}

const sourceRoot = path.join(root, "templates", template);
const date = new Date().toISOString().slice(0, 10);
const replacements = [
  ["__SLUG__", slug],
  ["__TITLE__", slug],
  ["__DATE__", date],
];

async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "package-lock.json") {
      continue;
    }
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyTree(source, target);
      continue;
    }
    if (!/\.(md|json|html|css|ts|tsx|mjs|js|txt|yml|svg)$/.test(entry.name)) {
      await cp(source, target);
      continue;
    }
    let text = await readFile(source, "utf8");
    for (const [key, value] of replacements) text = text.replaceAll(key, value);
    await writeFile(target, text);
  }
}

await copyTree(sourceRoot, dest);

if (template === "vite") {
  console.log(`demos/${slug} の依存を入れ、package-lock.json を作ります。`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn("npm", ["install"], { cwd: dest, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    console.error("npm install に失敗しました。demos/" + slug + " は途中まで作られています。");
    process.exit(code);
  }
}

console.log(`demos/${slug} を作りました（${template}）。`);
console.log(`次に demos/${slug}/demo.json の title、description、tags、tech を書き、README.md と中身を実装してください。`);
console.log("測っていない数値は、画面にも README にも書かないでください。");
console.log("確認はリポジトリのルートで npm run build です。");
