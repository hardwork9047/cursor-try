import { useEffect, useRef, useState } from "react";
import { ITERATIONS, MAX_EDGE, MIN_AREA, N_JOBS, N_SENSORS, N_STATIONS, WARMUP } from "./params";
import { renderShareCard } from "./shareCard";
import { formatInt, formatMs, formatSpeedup } from "./stats";
import type { BenchResult, Pair, WorkerOut } from "./types";

type ReadyImage = { pixels: Uint8Array; width: number; height: number };

function paint(canvas: HTMLCanvasElement | null, pixels: Uint8ClampedArray | Uint8Array | null, width: number, height: number) {
  if (!canvas) return;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (!pixels) {
    ctx.fillStyle = "#12110e";
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const image = new ImageData(new Uint8ClampedArray(pixels), width, height);
  ctx.putImageData(image, 0, 0);
}

function Times({ pair }: { pair: Pair | null }) {
  const spread = (summary: Pair["jsCompute"] | null) => {
    if (!summary) return "—";
    return `最小 ${formatMs(summary.min)} / 最大 ${formatMs(summary.max)}`;
  };
  const ms = (summary: Pair["jsCompute"] | null) => (summary ? formatMs(summary.median) : "—");
  const sentence = (js: number | undefined, rust: number | undefined) =>
    pair && js !== undefined && rust !== undefined ? formatSpeedup(js, rust) : "—";
  return (
    <>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>計算だけ</th>
            <th>コピー込み</th>
          </tr>
        </thead>
        <tbody>
          <tr className="side-js">
            <th>
              <span className="side js">JavaScript</span>
            </th>
            <td>
              <span className="num">{ms(pair?.jsCompute ?? null)}</span>
              <span className="spread">{spread(pair?.jsCompute ?? null)}</span>
            </td>
            <td>
              <span className="num">{ms(pair?.jsTransfer ?? null)}</span>
              <span className="spread">{spread(pair?.jsTransfer ?? null)}</span>
            </td>
          </tr>
          <tr className="side-rust">
            <th>
              <span className="side rust">Rust（WebAssembly）</span>
            </th>
            <td>
              <span className="num">{ms(pair?.wasmCompute ?? null)}</span>
              <span className="spread">{spread(pair?.wasmCompute ?? null)}</span>
            </td>
            <td>
              <span className="num">{ms(pair?.wasmTransfer ?? null)}</span>
              <span className="spread">{spread(pair?.wasmTransfer ?? null)}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="speedup">
        <span className="speedup-kind">計算だけ</span>
        <span className="speedup-text">{sentence(pair?.jsCompute.median, pair?.wasmCompute.median)}</span>
      </p>
      <p className="speedup">
        <span className="speedup-kind">コピー込み</span>
        <span className="speedup-text">{sentence(pair?.jsTransfer.median, pair?.wasmTransfer.median)}</span>
      </p>
    </>
  );
}

function Match({ value }: { value: boolean | null }) {
  if (value === null) return <p className="match wait">照合 —</p>;
  if (value) return <p className="match ok">照合 ✓ 一致</p>;
  return <p className="match bad">照合 不一致</p>;
}

export function App() {
  const workerRef = useRef<Worker | null>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const jsRef = useRef<HTMLCanvasElement>(null);
  const wasmRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<ReadyImage | null>(null);
  const [imageError, setImageError] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<BenchResult | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const cores = typeof navigator === "undefined" ? null : navigator.hardwareConcurrency;
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;

  useEffect(() => {
    const worker = new Worker(new URL("./bench.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const message = event.data;
      if (message.type === "progress") {
        setProgress(message.label);
        return;
      }
      if (message.type === "error") {
        setRunning(false);
        setProgress("");
        setError(message.message);
        setResult(null);
        return;
      }
      const done = message.result;
      done.cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null;
      done.userAgent = navigator.userAgent;
      setResult(done);
      setRunning(false);
      setProgress("");
      setError("");
    };
    worker.onerror = (event) => {
      setRunning(false);
      setProgress("");
      setError(event.message || "ワーカーが失敗しました");
      setResult(null);
    };
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loader = new Image();
    loader.src = `${import.meta.env.BASE_URL}apples.jpg`;
    loader.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(loader.naturalWidth, loader.naturalHeight));
      const width = Math.max(1, Math.round(loader.naturalWidth * scale));
      const height = Math.max(1, Math.round(loader.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        setImageError("キャンバスから画素を読めません");
        return;
      }
      ctx.drawImage(loader, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height);
      if (cancelled) return;
      setImage({ pixels: new Uint8Array(data.data), width, height });
    };
    loader.onerror = () => {
      if (!cancelled) setImageError("サンプル画像を読めません");
    };
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!image) return;
    paint(originalRef.current, image.pixels, image.width, image.height);
    paint(jsRef.current, result ? result.image.jsPixels : null, image.width, image.height);
    paint(wasmRef.current, result ? result.image.wasmPixels : null, image.width, image.height);
  }, [image, result]);

  useEffect(() => {
    if (!result) {
      setCardUrl(null);
      return;
    }
    const canvas = renderShareCard(result);
    const url = canvas.toDataURL("image/png");
    setCardUrl(url);
  }, [result]);

  function run() {
    if (!image || !workerRef.current || running) return;
    setRunning(true);
    setError("");
    setResult(null);
    setCardUrl(null);
    setProgress("始めています");
    const pixels = image.pixels.slice();
    workerRef.current.postMessage({ pixels, width: image.width, height: image.height }, [pixels.buffer]);
  }

  function downloadCard() {
    if (!cardUrl || !result) return;
    const a = document.createElement("a");
    a.href = cardUrl;
    a.download = "js-wasm-bench.png";
    a.click();
  }

  return (
    <>
      <div className="topbar">
        <a href="../">現場のブラウザ</a>
        <span>JavaScript / Rust（WebAssembly）</span>
      </div>
      <header className="mast">
        <div className="mast-inner">
          <p className="kicker">GENBA · 同じ仕事を両方で</p>
          <h1>JavaScript と Rust の速度</h1>
          <p className="explain">Rust のコードは WebAssembly にコンパイルして、ブラウザの中で動かします。</p>
          <p className="lede">
            外観検査、ラインの流れ、センサ列を、素の JavaScript と Rust（WebAssembly）に同じ手順でやらせます。数字は、このブラウザで測ったものだけです。まだ測っていない欄は「—」です。
          </p>
          <p className="legend">
            <span className="side js">JavaScript</span>
            <span className="side rust">Rust（WebAssembly）</span>
          </p>
        </div>
      </header>
      <main>
        <section className="env">
          <dl>
            <dt>論理コア</dt>
            <dd>{typeof cores === "number" ? cores : "—"}</dd>
            <dt>userAgent</dt>
            <dd>{userAgent || "—"}</dd>
          </dl>
          <p>
            ウォームアップ {WARMUP} 回は捨て、続く {ITERATIONS} 回の中央値と、最小・最大を出します。0 始まりの偶数回は JavaScript を先に、奇数回は Rust（WebAssembly）を先に測ります。計算だけは作業バッファに入ったあとの処理です。コピー込みは、入力の複製、計算、結果の読み戻しまでです。Rust（WebAssembly）の複製は線形メモリへのコピーです。処理は Web Worker の中なので、画面は動いたままです。表の下の文は、測った中央値から作っています。
          </p>
        </section>
        <div className="actions">
          <button type="button" onClick={run} disabled={!image || running}>
            このブラウザで測る
          </button>
          <button type="button" className="secondary" onClick={downloadCard} disabled={!result || !cardUrl}>
            共有カードを保存
          </button>
          {progress ? <span className="progress">{progress}</span> : null}
          {error ? <span className="error">{error}</span> : null}
        </div>
        {imageError ? <p className="error">{imageError}</p> : null}

        <section className="card">
          <h2>外観検査の画像処理</h2>
          <p className="what">
            輝度、3×3 の平均、大津の二値化、4 連結のラベリングです。面積 {MIN_AREA} 画素以上の連結成分を数えます。作業画像の長辺は最大 {MAX_EDGE} px です。
            {image ? ` いまの大きさは ${image.width}×${image.height} です。` : ""}
          </p>
          <div className="frames">
            <figure>
              <figcaption>元画像</figcaption>
              <canvas ref={originalRef} />
            </figure>
            <figure className="js">
              <figcaption>
                <span className="side js">JavaScript</span>
              </figcaption>
              <canvas ref={jsRef} />
            </figure>
            <figure className="rust">
              <figcaption>
                <span className="side rust">Rust（WebAssembly）</span>
              </figcaption>
              <canvas ref={wasmRef} />
            </figure>
          </div>
          <p className="what">
            写真は Nutrition, Food Safety &amp; Health による{" "}
            <a href="https://commons.wikimedia.org/wiki/File:Washed_apples_on_kitchen_towel_drying.jpg">
              Washed apples
            </a>
            （CC0）です。
          </p>
          <Match value={result ? result.image.match : null} />
          <ul className="facts">
            <li>
              <span className="side js">JavaScript</span> 連結成分 <b>{result ? result.image.jsCount : "—"}</b>
            </li>
            <li>
              <span className="side rust">Rust（WebAssembly）</span> 連結成分 <b>{result ? result.image.wasmCount : "—"}</b>
            </li>
          </ul>
          <Times pair={result?.image ?? null} />
        </section>

        <section className="card">
          <h2>ラインのシミュレーション</h2>
          <p className="what">
            {N_JOBS.toLocaleString("ja-JP")} 個の仕事が {N_STATIONS} 工程を、追い越しなしで通ります。到着間隔は 1 から 8、各工程の処理は 1 から 32 の整数です。入力の乱数は測定の前に一度だけ作り、毎回複製してから流します。
          </p>
          <Match value={result ? result.line.match : null} />
          <ul className="facts">
            <li>
              <span className="side js">JavaScript</span> 完了時刻 <b>{formatInt(result ? result.line.jsMakespan : null)}</b>
            </li>
            <li>
              <span className="side rust">Rust（WebAssembly）</span> 完了時刻 <b>{formatInt(result ? result.line.wasmMakespan : null)}</b>
            </li>
            <li>
              <span className="side js">JavaScript</span> リードタイム合計 <b>{formatInt(result ? result.line.jsLead : null)}</b>
            </li>
            <li>
              <span className="side rust">Rust（WebAssembly）</span> リードタイム合計 <b>{formatInt(result ? result.line.wasmLead : null)}</b>
            </li>
            <li>
              <span className="side js">JavaScript</span> 最大待ち <b>{formatInt(result ? result.line.jsWait : null)}</b>
            </li>
            <li>
              <span className="side rust">Rust（WebAssembly）</span> 最大待ち <b>{formatInt(result ? result.line.wasmWait : null)}</b>
            </li>
          </ul>
          <Times pair={result?.line ?? null} />
        </section>

        <section className="card">
          <h2>センサ列の整列と集計</h2>
          <p className="what">
            {N_SENSORS.toLocaleString("ja-JP")} 個の読み値を、同じクイックソートで並べます。中央の位置は n/2、95% 点は 95×(n−1)/100 の切り捨てです。合計と、2³¹ 以上の個数も比べます。
          </p>
          <Match value={result ? result.sensors.match : null} />
          <ul className="facts">
            <li>
              <span className="side js">JavaScript</span> 中央の値 <b>{result ? result.sensors.jsP50.toLocaleString("ja-JP") : "—"}</b>
            </li>
            <li>
              <span className="side rust">Rust（WebAssembly）</span> 中央の値 <b>{result ? result.sensors.wasmP50.toLocaleString("ja-JP") : "—"}</b>
            </li>
            <li>
              <span className="side js">JavaScript</span> 95% 点 <b>{result ? result.sensors.jsP95.toLocaleString("ja-JP") : "—"}</b>
            </li>
            <li>
              <span className="side rust">Rust（WebAssembly）</span> 95% 点 <b>{result ? result.sensors.wasmP95.toLocaleString("ja-JP") : "—"}</b>
            </li>
          </ul>
          <Times pair={result?.sensors ?? null} />
        </section>

        {cardUrl && result ? (
          <section className="card">
            <h2>共有カード</h2>
            <p className="what">測定が終わったあとだけ作ります。PNG は上のボタンで保存できます。</p>
            <img className="card-preview" src={cardUrl} alt="この実行の共有カード" />
          </section>
        ) : null}

        <section className="note">
          <p>
            見本の時間や、前の実行の再生はありません。共有カードも、この画面で測り終わってから出します。
          </p>
        </section>
      </main>
      <footer className="foot">
        <span>数字は、開いたブラウザが測ったものだけです。</span>
      </footer>
    </>
  );
}
