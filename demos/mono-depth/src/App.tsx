import { useEffect, useRef, useState } from "react";
import { colorize } from "./colormap";
import { createEngine } from "./engine";
import { formatMs, formatRelative } from "./format";
import { detectGpu } from "./gpu";
import { INPUT_EDGE, MODEL_FILE, MODEL_LICENSE, MODEL_NAME, MODEL_PARAMS, MODEL_REVISION, PAPER_URL, WEIGHTS_URL } from "./model";
import { PointView } from "./PointView";
import { SAMPLES, type Sample } from "./samples";
import { renderShareCard } from "./shareCard";
import type { DepthRun, GpuInfo, Photo } from "./types";

function paintOriginal(canvas: HTMLCanvasElement | null, photo: Photo | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx || !photo) {
    canvas.width = 320;
    canvas.height = 180;
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  canvas.width = photo.width;
  canvas.height = photo.height;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(photo.pixels), photo.width, photo.height), 0, 0);
}

async function photoFromCanvas(canvas: HTMLCanvasElement, label: string, credit: string): Promise<Photo> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("画像を読めません");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    pixels: new Uint8ClampedArray(data.data),
    width: canvas.width,
    height: canvas.height,
    label,
    credit,
  };
}

async function photoFromUrl(url: string, label: string, credit: string): Promise<Photo> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を読めません");
  ctx.drawImage(image, 0, 0);
  return photoFromCanvas(canvas, label, credit);
}

export function App() {
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const loadedRef = useRef<{ loadMs: number; backend: DepthRun["backend"]; note: string } | null>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const blendRef = useRef<HTMLCanvasElement>(null);
  const depthLayerRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [run, setRun] = useState<DepthRun | null>(null);
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [blend, setBlend] = useState(1);
  const [click, setClick] = useState<{ x: number; y: number; relative: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  useEffect(() => {
    const engine = createEngine();
    engineRef.current = engine;
    return () => engine.close();
  }, []);

  useEffect(() => {
    void detectGpu().then(setGpu);
  }, []);

  useEffect(() => {
    paintOriginal(originalRef.current, photo);
  }, [photo]);

  useEffect(() => {
    if (!run) {
      depthLayerRef.current = null;
      return;
    }
    const layer = document.createElement("canvas");
    layer.width = run.width;
    layer.height = run.height;
    layer.getContext("2d")?.putImageData(colorize(run.relative, run.width, run.height), 0, 0);
    depthLayerRef.current = layer;
  }, [run]);

  useEffect(() => {
    const canvas = blendRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !photo) {
      canvas.width = 320;
      canvas.height = 180;
      return;
    }
    canvas.width = photo.width;
    canvas.height = photo.height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(photo.pixels), photo.width, photo.height), 0, 0);
    const layer = depthLayerRef.current;
    if (!run || !layer) return;
    ctx.globalAlpha = blend;
    ctx.drawImage(layer, 0, 0);
    ctx.globalAlpha = 1;
  }, [photo, run, blend]);

  useEffect(() => {
    if (!run || !photo) {
      setCardUrl(null);
      return;
    }
    const canvas = renderShareCard(photo, run, gpu);
    setCardUrl(canvas.toDataURL("image/png"));
  }, [run, photo, gpu]);

  function adopt(next: Photo) {
    setPhoto(next);
    setRun(null);
    setClick(null);
    setCardUrl(null);
    setError("");
    setBlend(1);
  }

  async function chooseSample(sample: Sample) {
    try {
      const credit = `${sample.author} / ${sample.license}`;
      adopt(await photoFromUrl(`${import.meta.env.BASE_URL}${sample.file}`, sample.label, credit));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "サンプルを読めません");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const next = await photoFromUrl(url, file.name, "このブラウザに読み込んだ画像");
      URL.revokeObjectURL(url);
      adopt(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "画像を読めません");
    }
  }

  async function snap() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("このブラウザはカメラを使えません");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || canvas.width === 0) throw new Error("カメラのフレームを読めません");
      ctx.drawImage(video, 0, 0);
      adopt(await photoFromCanvas(canvas, "カメラの一枚", "このブラウザのカメラ"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "カメラを使えません");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }

  async function estimate() {
    const engine = engineRef.current;
    if (!engine || !photo || running) return;
    setRunning(true);
    setError("");
    setRun(null);
    setClick(null);
    setCardUrl(null);
    setProgress("始めています");
    try {
      let loaded = loadedRef.current;
      if (!loaded) {
        const message = await engine.load(`${import.meta.env.BASE_URL}${MODEL_FILE}`, setProgress);
        loaded = { loadMs: message.loadMs, backend: message.backend, note: message.note };
        loadedRef.current = loaded;
      }
      const canvas = document.createElement("canvas");
      canvas.width = photo.width;
      canvas.height = photo.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("画像を渡せません");
      ctx.putImageData(new ImageData(new Uint8ClampedArray(photo.pixels), photo.width, photo.height), 0, 0);
      const bitmap = await createImageBitmap(canvas);
      const depth = await engine.infer(bitmap, setProgress);
      setRun({
        relative: depth.relative,
        width: depth.width,
        height: depth.height,
        inferMs: depth.inferMs,
        loadMs: loaded.loadMs,
        backend: loaded.backend,
        note: loaded.note,
        ranAt: new Date().toISOString(),
      });
      setProgress("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "推定に失敗しました");
      setProgress("");
    } finally {
      setRunning(false);
    }
  }

  function onBlendClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = blendRef.current;
    if (!canvas || !run) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(run.width - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * run.width)));
    const y = Math.min(run.height - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * run.height)));
    setClick({ x, y, relative: run.relative[y * run.width + x] });
  }

  function downloadCard() {
    if (!cardUrl) return;
    const a = document.createElement("a");
    a.href = cardUrl;
    a.download = "mono-depth.png";
    a.click();
  }

  const backendLabel = run ? (run.backend === "webgpu" ? "WebGPU" : "WASM") : "—";

  return (
    <>
      <div className="topbar">
        <a href="../">現場のブラウザ</a>
        <span>奥行き</span>
      </div>
      <header className="mast">
        <div className="mast-inner">
          <p className="kicker">GENBA · 一枚から</p>
          <h1>一枚の写真から奥行き</h1>
          <p className="lede">
            {MODEL_NAME} で、開いたブラウザの中だけ推定します。出るのは相対値です。メートルではありません。まだ測っていない欄は「—」です。
          </p>
        </div>
      </header>
      <main>
        <section className="env">
          <p>
            短い辺が {INPUT_EDGE} px 前後、14 の倍数になるよう縮めてから推論します。黄が手前、青が奥です。このモデルは値が大きいほど手前と判断します。点群はその相対値で浮かせただけで、実寸の立体ではありません。
          </p>
          <dl>
            <dt>バックエンド</dt>
            <dd>{backendLabel}</dd>
            <dt>モデル読込</dt>
            <dd>{formatMs(run ? run.loadMs : null)}</dd>
            <dt>推論</dt>
            <dd>{formatMs(run ? run.inferMs : null)}</dd>
            <dt>画像サイズ</dt>
            <dd>{run ? `${run.width}×${run.height}` : "—"}</dd>
            <dt>GPU</dt>
            <dd>{gpu?.name || "—"}</dd>
          </dl>
          {run?.note ? <p className="note-line">{run.note}</p> : null}
          {gpu?.detail ? <p className="note-line">{gpu.detail}</p> : null}
        </section>

        <div className="samples">
          {SAMPLES.map((sample) => (
            <button key={sample.id} type="button" onClick={() => void chooseSample(sample)} disabled={running}>
              {sample.label}
            </button>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={running}>
            画像を選ぶ
          </button>
          <button type="button" onClick={() => void snap()} disabled={running}>
            カメラを一枚撮る
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        <div className="actions">
          <button type="button" onClick={() => void estimate()} disabled={!photo || running}>
            この画像で推定
          </button>
          <button type="button" className="secondary" onClick={downloadCard} disabled={!cardUrl}>
            共有カードを保存
          </button>
          {progress ? <span className="progress">{progress}</span> : null}
          {error ? <span className="error">{error}</span> : null}
        </div>
        {photo ? <p className="credit">{photo.label} · {photo.credit}</p> : <p className="credit">画像はまだ選んでいません。</p>}

        <section className="card">
          <h2>元画像と奥行き</h2>
          <div className="frames">
            <figure>
              <figcaption>元画像</figcaption>
              <canvas ref={originalRef} />
            </figure>
            <figure>
              <figcaption>奥行き</figcaption>
              <canvas ref={blendRef} onClick={onBlendClick} />
            </figure>
          </div>
          <label className="slider">
            重ねる
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={blend}
              disabled={!run}
              onChange={(event) => setBlend(Number(event.target.value))}
            />
            <span>{run ? blend.toFixed(2) : "—"}</span>
          </label>
          <p className="what">
            右の画像をクリックすると、その点の相対値が出ます。0 がこの画像の中でいちばん奥、1 がいちばん手前です。メートルではありません。
          </p>
          <p className="inspect">
            相対値 <b>{formatRelative(click ? click.relative : null)}</b>
            {click ? <span className="where"> x {click.x} / y {click.y}</span> : null}
          </p>
        </section>

        <section className="card">
          <h2>点群</h2>
          <p className="what">ドラッグで回します。ホイールで寄ります。近いほど手前に出ます。</p>
          <PointView photo={photo} run={run} />
        </section>

        {cardUrl && run ? (
          <section className="card">
            <h2>共有カード</h2>
            <p className="what">推定が終わったあとだけ作ります。</p>
            <img className="card-preview" src={cardUrl} alt="この実行の共有カード" />
          </section>
        ) : null}

        <section className="note">
          <p>見本の奥行き図や、前の実行の再生はありません。数字は、この画面で推定したときだけ出ます。</p>
        </section>
      </main>
      <footer className="foot">
        <p>
          {MODEL_NAME}（{MODEL_PARAMS}）· ライセンス {MODEL_LICENSE} · ONNX {MODEL_REVISION.slice(0, 7)} ·{" "}
          <a href={PAPER_URL}>論文</a> · <a href={WEIGHTS_URL}>重み</a>
        </p>
        <p>出力は相対値です。メートルではありません。Base / Large は CC-BY-NC-4.0 のため使っていません。</p>
      </footer>
    </>
  );
}
