import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { GITHUB_BRANCH, GITHUB_REPO, META_FIELDS, STATUSES } from "./site.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  const error = new Error(message);
  error.catalog = true;
  throw error;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readMeta(file, kind, slug) {
  if (!(await exists(file))) {
    fail(`${path.relative(process.cwd(), file)} がありません。`);
  }
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`${path.relative(process.cwd(), file)} の JSON が壊れています: ${error.message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    fail(`${file} はオブジェクトである必要があります。`);
  }
  for (const field of META_FIELDS) {
    if (!(field in data)) {
      fail(`${path.relative(process.cwd(), file)} に ${field} がありません。`);
    }
  }
  const unknown = Object.keys(data).filter((key) => !META_FIELDS.includes(key));
  if (unknown.length > 0) {
    fail(
      `${path.relative(process.cwd(), file)} に未知の項目があります: ${unknown.join(", ")}。使えるのは ${META_FIELDS.join(", ")} です。`,
    );
  }
  for (const field of ["title", "description", "tech"]) {
    if (typeof data[field] !== "string" || data[field].trim() === "") {
      fail(`${path.relative(process.cwd(), file)} の ${field} は空にできません。`);
    }
  }
  if (
    !Array.isArray(data.tags) ||
    data.tags.length === 0 ||
    data.tags.some((tag) => typeof tag !== "string" || tag.trim() === "")
  ) {
    fail(`${path.relative(process.cwd(), file)} の tags は、空でない文字列の配列にしてください。`);
  }
  if (typeof data.date !== "string" || !DATE.test(data.date) || Number.isNaN(Date.parse(data.date))) {
    fail(`${path.relative(process.cwd(), file)} の date は YYYY-MM-DD です。`);
  }
  if (typeof data.status !== "string" || !Object.hasOwn(STATUSES, data.status)) {
    fail(
      `${path.relative(process.cwd(), file)} の status は ${Object.keys(STATUSES).join(" または ")} です。`,
    );
  }

  const tree =
    kind === "demo"
      ? `${GITHUB_REPO}/tree/${GITHUB_BRANCH}/demos/${slug}`
      : `${GITHUB_REPO}/tree/${GITHUB_BRANCH}/tools/${slug}`;
  const readme =
    kind === "demo"
      ? `${GITHUB_REPO}/blob/${GITHUB_BRANCH}/demos/${slug}/README.md`
      : `${GITHUB_REPO}/blob/${GITHUB_BRANCH}/tools/${slug}/README.md`;

  return {
    kind,
    slug,
    title: data.title.trim(),
    description: data.description.trim(),
    tags: data.tags.map((tag) => tag.trim()),
    date: data.date,
    tech: data.tech.trim(),
    status: data.status,
    statusLabel: STATUSES[data.status],
    dir: path.dirname(file),
    sourceUrl: tree,
    readmeUrl: readme,
  };
}

async function listDirs(dir) {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("_"),
    )
    .map((entry) => entry.name)
    .sort();
}

export async function loadCatalog(root) {
  const demos = [];
  for (const slug of await listDirs(path.join(root, "demos"))) {
    const dir = path.join(root, "demos", slug);
    const item = await readMeta(path.join(dir, "demo.json"), "demo", slug);
    const hasPackage = await exists(path.join(dir, "package.json"));
    const indexExists = await exists(path.join(dir, "index.html"));
    if (!hasPackage && !indexExists) {
      fail(`demos/${slug} には、ビルドする package.json か、静的な index.html が必要です。`);
    }
    demos.push({ ...item, hasPackage });
  }

  const tools = [];
  for (const slug of await listDirs(path.join(root, "tools"))) {
    const dir = path.join(root, "tools", slug);
    const item = await readMeta(path.join(dir, "tool.json"), "tool", slug);
    if (!(await exists(path.join(dir, "README.md")))) {
      fail(`tools/${slug}/README.md がありません。`);
    }
    tools.push(item);
  }

  const seen = new Set();
  for (const slug of [...demos, ...tools].map((item) => item.slug)) {
    if (seen.has(slug)) {
      fail(`slug「${slug}」がデモとツールで重なっています。フォルダ名を分けてください。`);
    }
    seen.add(slug);
  }

  const byDate = (a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug);
  demos.sort(byDate);
  tools.sort(byDate);
  return { demos, tools };
}
