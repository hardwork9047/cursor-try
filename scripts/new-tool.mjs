import { mkdir, readFile, stat, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function usage() {
  console.error("使い方: npm run new-tool -- <slug>\n\nslug は小文字・数字・ハイフンです。例: line-balance");
  process.exit(1);
}

function missing(error) {
  return error && error.code === "ENOENT";
}

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] === "-h" || args[0] === "--help") usage();
const slug = args[0];
if (!SLUG.test(slug)) {
  console.error("slug は小文字・数字・ハイフンだけにしてください。例: line-balance");
  process.exit(1);
}

const dest = path.join(root, "tools", slug);
for (const existing of [dest, path.join(root, "demos", slug)]) {
  try {
    await stat(existing);
    console.error(`${path.relative(root, existing)} は既にあります。`);
    process.exit(1);
  } catch (error) {
    if (!missing(error)) throw error;
  }
}

const sourceRoot = path.join(root, "templates", "tool");
const date = new Date().toISOString().slice(0, 10);
await mkdir(dest, { recursive: true });
const entries = await readdir(sourceRoot);
for (const name of entries) {
  let text = await readFile(path.join(sourceRoot, name), "utf8");
  text = text.replaceAll("__SLUG__", slug).replaceAll("__DATE__", date);
  await writeFile(path.join(dest, name), text);
}

console.log(`tools/${slug} を作りました。`);
console.log(`tool.json と README.md を書き、CLI はこのフォルダの中だけに置いてください。`);
console.log("Web の公開物にはなりません。ギャラリーは README とソースへのリンクを出します。");
