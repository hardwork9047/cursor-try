import { useEffect, useRef, useState } from "react";
import { SiteBar } from "../SiteBar";
import { YOLO_PAGE_URL } from "../config";
import { formatLoad, formatMs } from "../format";
import { detectGpu } from "../gpu";
import type { GpuStatus } from "../types";
import { COCO_CLASS_COUNT, className } from "./classes";
import { LineCounter, type Direction } from "./counter";
import { drawScene } from "./draw";
import { createEngine, type Engine } from "./engine";
import type { BackendName, LoadResult } from "./protocol";
import type { Box } from "./postprocess";
import { SAMPLES, YOLO_MODELS, assetUrl, type Sample } from "./samples";
import { renderYoloCard } from "./shareCard";

type FrameStats = {
  preprocessMs: number;
  inferenceMs: number;
  postprocessMs: number;
  fps: number | null;
  fpsNote: string;
};

type LoadPhase =
  | { phase: "loading"; loaded: number; total: number; session: boolean }
  | { phase: "ready"; info: LoadResult }
  | { phase: "error"; message: string };

type Credit = Pick<Sample, "author" | "page" | "label"> | null;

const MAX_EDGE = 1600;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tally(boxes: Box[]) {
  const map = new Map<number, number>();
  for (const box of boxes) map.set(box.classId, (map.get(box.classId) ?? 0) + 1);
  return [...map.entries()]
    .map(([classId, count]) => ({ classId, count }))
    .sort((a, b) => b.count - a.count || a.classId - b.classId);
}

function formatFps(fps: number | null): string {
  if (fps == null || !Number.isFinite(fps) || fps <= 0) return "—";
  return fps >= 10 ? fps.toFixed(1) : fps.toFixed(2);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function YoloApp() {
  const [gpu, setGpu] = useState<GpuStatus>({ webgpu: false, name: "", detail: "" });
  const [isolated, setIsolated] = useState(window.crossOriginIsolated);
  const [modelId, setModelId] = useState<(typeof YOLO_MODELS)[number]["id"]>("yolo26n");
  const [load, setLoad] = useState<LoadPhase>({
    phase: "loading",
    loaded: 0,
    total: 0,
    session: false,
  });
  const [conf, setConf] = useState(0.25);
  const [iou, setIou] = useState(0.7);
  const [counting, setCounting] = useState(false);
  const [lineRatio, setLineRatio] = useState(0.55);
  const [direction, setDirection] = useState<Direction>("down");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [crossTotal, setCrossTotal] = useState(0);
  const [crossRows, setCrossRows] = useState<{ classId: number; count: number }[]>([]);
  const [countedFrames, setCountedFrames] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [credit, setCredit] = useState<Credit>(null);
  const [exportNote, setExportNote] = useState("");
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const snapshotRef = useRef<HTMLCanvasElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const runGen = useRef(0);
  const retoken = useRef(0);
  const stamps = useRef<number[]>([]);
  const confRef = useRef(conf);
  const iouRef = useRef(iou);
  const countingRef = useRef(counting);
  const lineRatioRef = useRef(lineRatio);
  const directionRef = useRef(direction);
  const liveRef = useRef(false);
  const boxesRef = useRef<Box[]>([]);
  const statsRef = useRef<FrameStats | null>(null);
  const loadRef = useRef(load);
  const counterRef = useRef(new LineCounter());
  const cardUrlRef = useRef<string | null>(null);

  confRef.current = conf;
  iouRef.current = iou;
  countingRef.current = counting;
  lineRatioRef.current = lineRatio;
  directionRef.current = direction;
  loadRef.current = load;

  const model = YOLO_MODELS.find((item) => item.id === modelId) ?? YOLO_MODELS[0];
  const ready = load.phase === "ready";
  const rows = tally(boxes);

  useEffect(() => {
    let cancelled = false;
    detectGpu().then((status) => {
      if (cancelled) return;
      setGpu(status);
      setIsolated(window.crossOriginIsolated);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const engine = createEngine();
    engineRef.current = engine;
    let cancelled = false;
    runGen.current += 1;
    stopStream();
    setLive(false);
    liveRef.current = false;
    setBusy(false);
    setBoxes([]);
    boxesRef.current = [];
    setStats(null);
    statsRef.current = null;
    setHasFrame(false);
    setError(null);
    setExportNote("");
    counterRef.current.reset();
    setCrossTotal(0);
    setCrossRows([]);
    setCountedFrames(0);
    setLoad({ phase: "loading", loaded: 0, total: 0, session: false });
    engine
      .load(assetUrl(model.file), {
        onProgress: (loaded, total) => {
          if (!cancelled) setLoad({ phase: "loading", loaded, total, session: false });
        },
        onSession: () => {
          if (!cancelled) {
            setLoad((prev) => (prev.phase === "loading" ? { ...prev, session: true } : prev));
          }
        },
      })
      .then((info) => {
        if (cancelled) return;
        setLoad({ phase: "ready", info });
        setIsolated(window.crossOriginIsolated);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad({ phase: "error", message: messageOf(err) });
      });
    return () => {
      cancelled = true;
      runGen.current += 1;
      stopStream();
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
    // model.file is the only input; stopStream closes over refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.file]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (cardUrlRef.current) URL.revokeObjectURL(cardUrlRef.current);
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.srcObject = null;
    video.removeAttribute("src");
    video.load();
  }

  function bump() {
    runGen.current += 1;
    liveRef.current = false;
    setLive(false);
    return runGen.current;
  }

  function rememberUrl(next: string | null) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = next;
  }

  function capture(source: CanvasImageSource, srcW: number, srcH: number) {
    const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = snapshotRef.current ?? document.createElement("canvas");
    snapshotRef.current = canvas;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("キャンバスを初期化できませんでした");
    ctx.drawImage(source, 0, 0, w, h);
    return canvas;
  }

  function paint(snap: HTMLCanvasElement, nextBoxes: Box[]) {
    const stage = stageRef.current;
    if (!stage) return;
    stage.width = snap.width;
    stage.height = snap.height;
    const ctx = stage.getContext("2d");
    if (!ctx) return;
    const lineY = countingRef.current ? lineRatioRef.current * snap.height : null;
    drawScene(ctx, snap, snap.width, snap.height, nextBoxes, lineY);
  }

  function noteLiveFps(now: number): number | null {
    stamps.current.push(now);
    const cutoff = now - 1000;
    while (stamps.current.length && stamps.current[0] < cutoff) stamps.current.shift();
    if (stamps.current.length < 2) return null;
    const span = stamps.current[stamps.current.length - 1] - stamps.current[0];
    if (span <= 0) return null;
    return ((stamps.current.length - 1) * 1000) / span;
  }

  function applyFrame(snap: HTMLCanvasElement, nextBoxes: Box[], nextStats: FrameStats, fromLive: boolean) {
    boxesRef.current = nextBoxes;
    statsRef.current = nextStats;
    setHasFrame(true);
    setBoxes(nextBoxes);
    setStats(nextStats);
    paint(snap, nextBoxes);
    if (fromLive && countingRef.current) {
      counterRef.current.update(nextBoxes, lineRatioRef.current * snap.height, directionRef.current);
      setCrossTotal(counterRef.current.total());
      setCrossRows(counterRef.current.byClass());
      setCountedFrames((value) => value + 1);
    }
  }

  async function inferStill(source: CanvasImageSource, srcW: number, srcH: number, gen: number) {
    const engine = engineRef.current;
    if (!engine) return;
    setBusy(true);
    setError(null);
    setExportNote("");
    stamps.current = [];
    try {
      const snap = capture(source, srcW, srcH);
      if (runGen.current !== gen) return;
      const bitmap = await createImageBitmap(snap);
      if (runGen.current !== gen) {
        bitmap.close();
        return;
      }
      const result = await engine.detect(bitmap, confRef.current, iouRef.current);
      if (runGen.current !== gen) return;
      const cycle = result.preprocessMs + result.inferenceMs + result.postprocessMs;
      applyFrame(
        snap,
        result.boxes,
        {
          preprocessMs: result.preprocessMs,
          inferenceMs: result.inferenceMs,
          postprocessMs: result.postprocessMs,
          fps: cycle > 0 ? 1000 / cycle : null,
          fpsNote: "静止画1枚の処理時間から換算",
        },
        false,
      );
    } catch (err) {
      if (runGen.current === gen) setError(messageOf(err));
    } finally {
      if (runGen.current === gen) setBusy(false);
    }
  }

  async function runLoop(video: HTMLVideoElement, gen: number) {
    const engine = engineRef.current;
    if (!engine) return;
    liveRef.current = true;
    setLive(true);
    stamps.current = [];
    setError(null);
    while (runGen.current === gen) {
      if (video.ended) break;
      if (video.paused || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        await delay(40);
        continue;
      }
      try {
        const snap = capture(video, video.videoWidth, video.videoHeight);
        const bitmap = await createImageBitmap(snap);
        if (runGen.current !== gen) {
          bitmap.close();
          break;
        }
        const result = await engine.detect(bitmap, confRef.current, iouRef.current);
        if (runGen.current !== gen) break;
        applyFrame(
          snap,
          result.boxes,
          {
            preprocessMs: result.preprocessMs,
            inferenceMs: result.inferenceMs,
            postprocessMs: result.postprocessMs,
            fps: noteLiveFps(performance.now()),
            fpsNote: "処理できたフレームの間隔",
          },
          true,
        );
      } catch (err) {
        if (runGen.current === gen) setError(messageOf(err));
        break;
      }
    }
    if (runGen.current === gen) {
      liveRef.current = false;
      setLive(false);
    }
  }

  async function openStill(src: string, nextCredit: Credit) {
    const gen = bump();
    stopStream();
    counterRef.current.reset();
    setCrossTotal(0);
    setCrossRows([]);
    setCountedFrames(0);
    setCredit(nextCredit);
    const image = new Image();
    image.src = src;
    try {
      await image.decode();
    } catch (err) {
      if (runGen.current === gen) setError(messageOf(err));
      return;
    }
    if (runGen.current !== gen) return;
    await inferStill(image, image.naturalWidth, image.naturalHeight, gen);
  }

  async function startCamera() {
    const gen = bump();
    stopStream();
    counterRef.current.reset();
    setCrossTotal(0);
    setCrossRows([]);
    setCountedFrames(0);
    setCredit(null);
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("このブラウザはカメラを使えません。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (runGen.current !== gen) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      if (runGen.current !== gen) return;
      await runLoop(video, gen);
    } catch (err) {
      if (runGen.current === gen) setError(messageOf(err));
    }
  }

  async function startVideo(src: string) {
    const gen = bump();
    stopStream();
    counterRef.current.reset();
    setCrossTotal(0);
    setCrossRows([]);
    setCountedFrames(0);
    setCredit(null);
    setError(null);
    const video = videoRef.current;
    if (!video) return;
    video.src = src;
    try {
      await video.play();
    } catch (err) {
      if (runGen.current === gen) setError(messageOf(err));
      return;
    }
    if (runGen.current !== gen) return;
    await runLoop(video, gen);
  }

  function stopLive() {
    bump();
    stopStream();
  }

  async function rethreshold() {
    const engine = engineRef.current;
    const snap = snapshotRef.current;
    if (!engine || !snap || liveRef.current || !statsRef.current) return;
    const token = ++retoken.current;
    const gen = runGen.current;
    try {
      const result = await engine.rethreshold(confRef.current, iouRef.current);
      if (token !== retoken.current || runGen.current !== gen || !statsRef.current) return;
      const prev = statsRef.current;
      const cycle = prev.preprocessMs + prev.inferenceMs + result.postprocessMs;
      applyFrame(
        snap,
        result.boxes,
        {
          ...prev,
          postprocessMs: result.postprocessMs,
          fps: prev.fpsNote.startsWith("静止画") && cycle > 0 ? 1000 / cycle : prev.fps,
        },
        false,
      );
    } catch (err) {
      if (token === retoken.current && runGen.current === gen) setError(messageOf(err));
    }
  }

  function onConf(value: number) {
    confRef.current = value;
    setConf(value);
    void rethreshold();
  }

  function onIou(value: number) {
    iouRef.current = value;
    setIou(value);
    void rethreshold();
  }

  function onLine(value: number) {
    lineRatioRef.current = value;
    setLineRatio(value);
    counterRef.current.resetTracks();
    const snap = snapshotRef.current;
    if (snap) paint(snap, boxesRef.current);
  }

  function onDirection(next: Direction) {
    directionRef.current = next;
    setDirection(next);
    counterRef.current.resetTracks();
  }

  function onCounting(next: boolean) {
    countingRef.current = next;
    setCounting(next);
    const snap = snapshotRef.current;
    if (snap) paint(snap, boxesRef.current);
  }

  function resetCount() {
    counterRef.current.reset();
    setCrossTotal(0);
    setCrossRows([]);
    setCountedFrames(0);
  }

  async function onExport() {
    const snap = snapshotRef.current;
    const current = statsRef.current;
    const info = loadRef.current.phase === "ready" ? loadRef.current.info : null;
    if (!snap || !current || !info) return;
    setExportNote("");
    try {
      const blob = await renderYoloCard({
        image: snap,
        srcW: snap.width,
        srcH: snap.height,
        boxes: boxesRef.current,
        lineY: countingRef.current ? lineRatioRef.current * snap.height : null,
        modelLabel: `YOLO26${model.id === "yolo26s" ? "s" : "n"}`,
        backend: info.backend,
        loadMs: info.loadMs,
        preprocessMs: current.preprocessMs,
        inferenceMs: current.inferenceMs,
        postprocessMs: current.postprocessMs,
        fps: current.fps,
        fpsNote: current.fpsNote,
        gpuName: gpu.webgpu ? gpu.name : gpu.detail || "WebGPUなし",
        crossTotal: counting ? crossTotal : null,
        createdAt: new Date().toISOString(),
      });
      if (cardUrlRef.current) URL.revokeObjectURL(cardUrlRef.current);
      const url = URL.createObjectURL(blob);
      cardUrlRef.current = url;
      setCardUrl(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = `yolo26-${model.label}.png`;
      link.click();
      setExportNote("いまのフレームからPNGを保存しました。");
    } catch (err) {
      setExportNote(messageOf(err));
    }
  }

  const backend: BackendName | null = load.phase === "ready" ? load.info.backend : null;
  const webgpuNote = load.phase === "ready" ? load.info.webgpuNote : "";
  const locked = !ready || busy;

  return (
    <div className="app" data-testid="yolo-app" data-state={ready ? (stats ? "measured" : "ready") : load.phase}>
      <SiteBar current="yolo" />
      <header className="mast">
        <div>
          <p className="kicker">GENBA VISION · 現場の目視</p>
          <h1>YOLO26 ブラウザ検出</h1>
          <p className="lede">
            カメラ、画像、動画。箱も本数も処理時間も、この端末で推論した分だけ出す。
          </p>
        </div>
        <div className="chips">
          <span className="chip">
            分離 <b>{isolated ? "済" : "未"}</b>
          </span>
          <span className="chip" data-testid="backend-chip">
            推論 <b>{backend === "webgpu" ? "WebGPU" : backend === "wasm" ? "WASM" : "—"}</b>
          </span>
          <span className="chip">
            アダプタ <b>{gpu.webgpu ? gpu.name : "WebGPUなし"}</b>
          </span>
        </div>
      </header>
      <main className="board">
        <section className="panel" aria-label="入力">
          <h2>
            01 入力
            <span>source</span>
          </h2>
          <div className="models">
            {YOLO_MODELS.map((item) => (
              <button
                key={item.id}
                className="model"
                data-testid={`yolo-${item.id}`}
                aria-pressed={item.id === modelId}
                disabled={busy}
                onClick={() => setModelId(item.id)}
              >
                <span className="family">26{item.label === "nano" ? "n" : "s"}</span>
                <span className="label">{item.label}</span>
                <span className="meta">{item.note}</span>
              </button>
            ))}
          </div>
          <div className="sources">
            <button className="ghost" data-testid="open-camera" disabled={locked} onClick={() => void startCamera()}>
              カメラ
            </button>
            <label className={`ghost file${locked ? " is-disabled" : ""}`}>
              画像
              <input
                data-testid="image-file"
                type="file"
                accept="image/*"
                disabled={locked}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const url = URL.createObjectURL(file);
                  rememberUrl(url);
                  void openStill(url, null);
                }}
              />
            </label>
            <label className={`ghost file${locked ? " is-disabled" : ""}`}>
              動画
              <input
                data-testid="video-file"
                type="file"
                accept="video/*"
                disabled={locked}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const url = URL.createObjectURL(file);
                  rememberUrl(url);
                  void startVideo(url);
                }}
              />
            </label>
            {live && (
              <button className="ghost" data-testid="stop-live" onClick={stopLive}>
                停止
              </button>
            )}
          </div>
          <p className="conditions">サンプルは CC0。検出はその場で計算します。</p>
          <div className="sources">
            {SAMPLES.map((sample) => (
              <button
                key={sample.id}
                className="ghost"
                data-testid={`sample-${sample.id}`}
                disabled={locked}
                onClick={() => void openStill(assetUrl(sample.file), sample)}
              >
                {sample.label}
              </button>
            ))}
          </div>
          <label className="slider">
            <span>信頼度</span>
            <input
              data-testid="conf-slider"
              type="range"
              min={0.05}
              max={0.9}
              step={0.01}
              value={conf}
              onChange={(event) => onConf(Number(event.target.value))}
            />
            <b>{conf.toFixed(2)}</b>
          </label>
          <label className="slider">
            <span>IoU</span>
            <input
              data-testid="iou-slider"
              type="range"
              min={0.1}
              max={0.95}
              step={0.01}
              value={iou}
              onChange={(event) => onIou(Number(event.target.value))}
            />
            <b>{iou.toFixed(2)}</b>
          </label>
          <p className="conditions">
            既定は信頼度 0.25、IoU 0.70。one-to-many の出力を、このブラウザで NMS しています。
          </p>
          <div className="count-box">
            <label className="check">
              <input
                data-testid="count-toggle"
                type="checkbox"
                checked={counting}
                onChange={(event) => onCounting(event.target.checked)}
              />
              計数モード（線を越えた数）
            </label>
            <label className="slider">
              <span>ライン</span>
              <input
                data-testid="line-slider"
                type="range"
                min={0.1}
                max={0.9}
                step={0.01}
                value={lineRatio}
                disabled={!counting}
                onChange={(event) => onLine(Number(event.target.value))}
              />
              <b>{Math.round(lineRatio * 100)}%</b>
            </label>
            <div className="seg">
              <button
                type="button"
                aria-pressed={direction === "down"}
                disabled={!counting}
                onClick={() => onDirection("down")}
              >
                上から下
              </button>
              <button
                type="button"
                aria-pressed={direction === "up"}
                disabled={!counting}
                onClick={() => onDirection("up")}
              >
                下から上
              </button>
            </div>
            <p className="conditions">
              画面上の重心が線を越えたときだけ足します。カメラか動画で、処理できたフレームの間だけです。
            </p>
            <button className="ghost" type="button" onClick={resetCount}>
              通過数を戻す
            </button>
          </div>
        </section>

        <section className="panel" aria-label="画面">
          <h2>
            02 画面
            <span>{live ? "live" : stats ? "frame" : "idle"}</span>
          </h2>
          <div className="stage">
            <video ref={videoRef} className="media-sink" playsInline muted />
            <canvas ref={stageRef} data-testid="stage" hidden={!hasFrame} />
            {!hasFrame && (
              <p className="stage-empty">
                {load.phase === "loading"
                  ? load.session
                    ? "セッションを作成しています…"
                    : load.total > 0
                      ? `モデルを取得しています ${formatBytes(load.loaded)} / ${formatBytes(load.total)}`
                      : "モデルを読んでいます…"
                  : "カメラ、画像、動画、またはサンプルを選ぶと、ここで推論します。"}
              </p>
            )}
          </div>
          <p className="status-line" data-testid="status-line">
            {busy
              ? "推論しています…"
              : live
                ? "連続して推論しています。遅いフレームは飛ばします。"
                : stats
                  ? `このフレーム ${boxes.length} 件`
                  : ready
                    ? "入力を待っています。"
                    : load.phase === "error"
                      ? "モデルを読めませんでした。"
                      : "モデルを準備しています。"}
          </p>
          {credit && (
            <p className="conditions">
              サンプル「{credit.label}」 CC0 · {credit.author} ·{" "}
              <a href={credit.page}>Wikimedia Commons</a>
            </p>
          )}
          {error && (
            <p className="error" role="alert" data-testid="yolo-error">
              {error}
            </p>
          )}
        </section>

        <section className="panel" aria-label="実測">
          <h2>
            03 実測
            <span>{stats ? "measured" : "—"}</span>
          </h2>
          <div className="metrics">
            <Metric
              kind="backend"
              kana="バックエンド"
              en="backend"
              value={backend === "webgpu" ? "WebGPU" : backend === "wasm" ? "WASM" : "—"}
              note={backend ? "このセッション" : "セッション後に出ます"}
            />
            <Metric
              kind="load"
              kana="モデル読込"
              en="load"
              value={load.phase === "ready" ? formatLoad(load.info.loadMs) : "—"}
              note={load.phase === "ready" ? `取得 ${formatBytes(load.info.bytes)}` : "取得と初期化"}
            />
            <Metric
              kind="pre"
              kana="前処理"
              en="preprocess"
              value={stats ? formatMs(stats.preprocessMs) : "—"}
              note="リサイズと正規化"
            />
            <Metric
              kind="infer"
              kana="推論"
              en="inference"
              value={stats ? formatMs(stats.inferenceMs) : "—"}
              note="セッションの実行"
            />
            <Metric
              kind="post"
              kana="後処理"
              en="postprocess"
              value={stats ? formatMs(stats.postprocessMs) : "—"}
              note="信頼度と NMS"
            />
            <Metric
              kind="fps"
              kana="FPS"
              en="frames/s"
              value={formatFps(stats?.fps ?? null)}
              note={stats?.fpsNote ?? "フレームを処理すると出ます"}
            />
          </div>
          <div className="metric gpu-row" data-kind="gpu" data-testid="metric-gpu">
            <span className="kana">アダプタ</span>
            <span className="en">adapter</span>
            <b>{gpu.webgpu ? gpu.name : "WebGPUなし"}</b>
            <span className="note">
              {backend === "webgpu"
                ? "この推論で使用"
                : backend === "wasm" && gpu.webgpu
                  ? "検出したが、この推論は WASM"
                  : gpu.detail || "検出のみ。推論値ではない"}
            </span>
          </div>
          {webgpuNote && <p className="conditions">{webgpuNote}</p>}
          <h2 className="subhead">
            このフレーム
            <span data-testid="det-count">{stats ? `${boxes.length} 件` : "—"}</span>
          </h2>
          <ul className="counts" data-testid="class-counts">
            {stats && rows.length === 0 && <li>検出なし</li>}
            {rows.map((row) => (
              <li key={row.classId}>
                <span>{className(row.classId)}</span>
                <b>{row.count}</b>
              </li>
            ))}
            {!stats && <li className="muted-row">推論後にクラスごとの数が出ます</li>}
          </ul>
          <h2 className="subhead">
            ライン通過
            <span data-testid="cross-total">{counting && countedFrames > 0 ? `${crossTotal}` : "—"}</span>
          </h2>
          <ul className="counts" data-testid="cross-counts">
            {counting && countedFrames > 0 && crossRows.length === 0 && <li>通過はまだありません</li>}
            {counting &&
              countedFrames > 0 &&
              crossRows.map((row) => (
                <li key={row.classId}>
                  <span>{className(row.classId)}</span>
                  <b>{row.count}</b>
                </li>
              ))}
            {(!counting || countedFrames === 0) && (
              <li className="muted-row">カメラか動画で、線を越えると増えます</li>
            )}
          </ul>
          <div className="card-actions">
            <button className="ghost" data-testid="export-png" disabled={!stats || !ready} onClick={() => void onExport()}>
              PNGを保存
            </button>
            <span className="export-note">{exportNote}</span>
          </div>
          {cardUrl && <img className="card-preview" src={cardUrl} alt="書き出した検出画像" />}
        </section>
      </main>
      <footer className="foot">
        <span>
          Ultralytics YOLO26（2026年1月14日公開）· COCO {COCO_CLASS_COUNT}クラス · 重みは{" "}
          <a href={`${import.meta.env.BASE_URL}models/LICENSE-AGPL-3.0.txt`}>AGPL-3.0</a>
          。商用製品への組み込みは Enterprise License。
        </span>
        <a href={YOLO_PAGE_URL}>{YOLO_PAGE_URL.replace("https://", "")}</a>
      </footer>
    </div>
  );
}

function Metric({
  kind,
  kana,
  en,
  value,
  note,
}: {
  kind: string;
  kana: string;
  en: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric" data-kind={kind} data-testid={`metric-${kind}`}>
      <span className="kana">{kana}</span>
      <span className="en">{en}</span>
      <b>{value}</b>
      <span className="note">{note}</span>
    </div>
  );
}
