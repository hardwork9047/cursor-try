import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "public/models/depth-anything-v2-small-fp16.onnx");
const url =
  "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/64fe43eba7f8a384b02fe3fadaa26cbba35548d8/onnx/model_fp16.onnx";
const sha256 = "2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04";

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

if (existsSync(dest) && (await hashFile(dest)) === sha256) {
  console.log("mono-depth: ONNX は既にあります。");
  process.exit(0);
}

mkdirSync(path.dirname(dest), { recursive: true });
console.log("mono-depth: Depth Anything V2 Small の ONNX を取得します。");
const response = await fetch(url);
if (!response.ok) {
  console.error(`mono-depth: モデルの取得に失敗しました (${response.status})。`);
  process.exit(1);
}
const tmp = `${dest}.partial`;
const bytes = Buffer.from(await response.arrayBuffer());
const digest = createHash("sha256").update(bytes).digest("hex");
if (digest !== sha256) {
  rmSync(tmp, { force: true });
  console.error(`mono-depth: SHA-256 が一致しません。${digest}`);
  process.exit(1);
}
const { writeFileSync } = await import("node:fs");
writeFileSync(tmp, bytes);
renameSync(tmp, dest);
console.log("mono-depth: ONNX を public/models に置きました。");
