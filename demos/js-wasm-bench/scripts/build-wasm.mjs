import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function requireTool(command, hint) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`js-wasm-bench: \`${command}\` がありません。${hint}`);
    process.exit(1);
  }
}

requireTool("rustc", "rustup で stable を入れてください。");
requireTool("wasm-pack", "README の手順で wasm-pack を入れてください。");

const targets = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" });
if (targets.status !== 0 || !targets.stdout.includes("wasm32-unknown-unknown")) {
  console.error(
    "js-wasm-bench: wasm32-unknown-unknown がありません。`rustup target add wasm32-unknown-unknown` を実行してください。",
  );
  process.exit(1);
}

rmSync(path.join(root, "src/wasm"), { recursive: true, force: true });
const build = spawnSync(
  "wasm-pack",
  [
    "build",
    "wasm",
    "--target",
    "web",
    "--release",
    // binaryen 108 は externref のテーブル export を入れ替えるので、ここは --no-opt のまま。
    "--no-opt",
    "--out-dir",
    "../src/wasm",
    "--out-name",
    "kernel",
  ],
  { cwd: root, stdio: "inherit" },
);
if (build.status !== 0) {
  console.error("js-wasm-bench: wasm-pack build が失敗しました。");
  process.exit(build.status ?? 1);
}
