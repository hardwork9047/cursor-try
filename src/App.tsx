import { useEffect, useMemo, useRef, useState } from "react";
import { explainFailure, runBenchmark } from "./benchmark";
import { MAX_TOKENS, PAGE_URL, TEMPERATURE } from "./config";
import { playDemo } from "./demoData";
import { detectGpu } from "./gpu";
import { formatCycle, formatLoad, formatMs, formatTok, formatWhen } from "./format";
import { MODELS, type ModelOption } from "./models";
import { activePrompts, FIXED_PROMPTS } from "./prompts";
import { renderShareCard } from "./shareCard";
import { clearHistory, isDemo, loadHistory, saveRun } from "./storage";
import type { BenchProgress, GpuStatus, RunRecord } from "./types";

function latestFor(runs: RunRecord[], modelId: string): RunRecord | undefined {
  return [...runs]
    .filter((run) => run.modelId === modelId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function BarChart({
  runs,
  selectedId,
  latestId,
}: {
  runs: RunRecord[];
  selectedId: string;
  latestId?: string;
}) {
  const width = 320;
  const height = 132;
  const max = Math.max(
    10,
    ...MODELS.map((model) => latestFor(runs, model.id)?.decodeTokPerS ?? 0),
  );
  const slot = width / MODELS.length;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="機種別のスループット"
    >
      <pattern
        id="sample-hatch"
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(40)"
      >
        <rect width="5" height="5" fill="#e2a30b" />
        <line x1="0" y1="0" x2="0" y2="5" stroke="#1a1814" strokeWidth="1.4" />
      </pattern>
      {MODELS.map((model, index) => {
        const run = latestFor(runs, model.id);
        const value = run?.decodeTokPerS ?? 0;
        const barHeight = value > 0 ? Math.max(8, (value / max) * 78) : 3;
        const x = index * slot + 18;
        const y = 90 - barHeight;
        const selected = model.id === selectedId;
        const latest = run?.id === latestId;
        return (
          <g key={model.id}>
            <rect
              x={x}
              y={y}
              width={slot - 28}
              height={barHeight}
              fill={run ? (run.demo ? "url(#sample-hatch)" : "#1d4f3a") : "#d9d0c2"}
              stroke={selected || latest ? "#1a1814" : "none"}
              strokeWidth={selected || latest ? 1.5 : 0}
            />
            <text x={x} y={86 - barHeight} fontSize="10">
              {value > 0 ? formatTok(value) : "—"}
            </text>
            <text x={x} y={112} fontSize="10">
              {model.family}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [gpu, setGpu] = useState<GpuStatus>({
    webgpu: false,
    name: "",
    detail: "",
  });
  const [isolated, setIsolated] = useState(window.crossOriginIsolated);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [custom, setCustom] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BenchProgress | null>(null);
  const [result, setResult] = useState<RunRecord | null>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [exportNote, setExportNote] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const model = MODELS.find((item) => item.id === modelId) ?? MODELS[0];
  const prompts = useMemo(() => activePrompts(custom), [custom]);
  const recent = useMemo(
    () => [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [history],
  );
  const preview = result ?? recent[0] ?? null;
  const blocked = !isDemo && !gpu.webgpu;

  useEffect(() => {
    let cancelled = false;
    detectGpu().then((status) => {
      if (cancelled) return;
      setGpu(status);
      setIsolated(window.crossOriginIsolated);
      setHistory(loadHistory(isDemo));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!preview) {
      setCardUrl(null);
      setCardBlob(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    renderShareCard(preview)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setCardBlob(blob);
        setCardUrl(url);
      })
      .catch(() => {
        if (!cancelled) setCardUrl(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview]);

  async function onRun() {
    setError(null);
    setExportNote("");
    setRunning(true);
    setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const onProgress = (next: BenchProgress) => setProgress(next);
    try {
      const record = isDemo
        ? await playDemo({
            model,
            prompts,
            signal: controller.signal,
            onProgress,
          })
        : await runBenchmark({
            model,
            prompts,
            gpuName: gpu.name,
            signal: controller.signal,
            onProgress,
          });
      setResult(record);
      setHistory(saveRun(record, isDemo));
      setProgress(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("測定を中断しました。");
      } else {
        setError(explainFailure(err));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function onStop() {
    abortRef.current?.abort();
  }

  function onExport() {
    if (!cardBlob || !preview) return;
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(cardBlob);
    link.href = objectUrl;
    link.download = `genba-bench-${preview.modelLabel.replace(/\s+/g, "-")}.png`;
    link.click();
    URL.revokeObjectURL(objectUrl);
    setExportNote(
      preview.demo
        ? "サンプルのPNGを保存しました。数値は実測ではありません。"
        : "測定カードのPNGを保存しました。",
    );
  }

  if (!ready) {
    return <div className="booting">設備を確認しています…</div>;
  }

  const activeTitle = progress?.kind === "prompt" ? progress.title : null;
  const liveText = progress?.kind === "prompt" ? progress.text : "";
  const loadProgress = progress?.kind === "load" ? progress.progress : running ? 1 : 0;

  return (
    <div className="app" data-testid="app-ready" data-demo={isDemo ? "1" : "0"}>
      <header className="mast">
        <div>
          <p className="kicker">GENBA BENCH · 現場の数字</p>
          <h1>ブラウザ内ローカルLLM ベンチマーク</h1>
          <p className="lede">
            モデルはこの端末の中だけ。段取り時間とスループットを、ブラウザのGPUで測る。
          </p>
        </div>
        <div className="chips">
          <span className="chip">
            WebGPU <b>{gpu.webgpu ? "利用可" : "利用不可"}</b>
          </span>
          <span className="chip">
            分離 <b>{isolated ? "済" : "未"}</b>
          </span>
          <span className="chip">
            モード <b>{isDemo ? "サンプル再生" : "実測"}</b>
          </span>
          <span className="chip">
            検出 <b>{gpu.webgpu ? gpu.name : "なし"}</b>
          </span>
        </div>
      </header>

      {isDemo && (
        <div className="banner" data-testid="demo-banner" role="status">
          サンプル再生です。表示中の数値・生成文は実測でもモデルの出力でもありません。
        </div>
      )}

      <section className="jobs" aria-label="作業標準">
        <ol>
          {FIXED_PROMPTS.map((prompt, index) => (
            <li
              key={prompt.id}
              data-testid={`prompt-${prompt.id}`}
              data-active={activeTitle === prompt.title ? "true" : "false"}
            >
              <span className="idx">0{index + 1}</span>
              {prompt.title}
            </li>
          ))}
        </ol>
        <label className="custom">
          任意
          <input
            data-testid="custom-prompt"
            value={custom}
            maxLength={800}
            placeholder="追加プロンプト（空なら固定3問）"
            onChange={(event) => setCustom(event.target.value)}
            disabled={running}
          />
        </label>
      </section>

      <main className="board">
        <section className="panel" aria-label="設備選定">
          <h2>
            01 設備
            <span>model</span>
          </h2>
          <div className="models">
            {MODELS.map((item) => (
              <ModelButton
                key={item.id}
                model={item}
                pressed={item.id === modelId}
                disabled={running}
                onSelect={() => setModelId(item.id)}
              />
            ))}
          </div>
          <p className="conditions">
            条件 固定{FIXED_PROMPTS.length}問
            {custom.trim() ? " + 任意" : ""} · max_tokens {MAX_TOKENS} · temperature{" "}
            {TEMPERATURE} · 思考オフ
            <br />
            段取り時間は要求から最初のトークンまで。スループットは生成の tok/s。
          </p>
          {blocked ? (
            <div className="blocked" data-testid="webgpu-blocked">
              <p>このブラウザでは WebGPU が使えません。</p>
              <p>
                Chrome または Edge の最新版で、ハードウェアアクセラレーションを有効にして開き直してください。
              </p>
              <p>
                <a href={`${import.meta.env.BASE_URL}?demo=1`}>サンプル再生を見る</a>
              </p>
              {gpu.detail && <p className="note">{gpu.detail}</p>}
            </div>
          ) : (
            <button
              className={running ? "run stop" : "run"}
              data-testid={running ? "stop-benchmark" : "run-benchmark"}
              onClick={running ? onStop : onRun}
            >
              {running ? "中断" : "測定開始"}
            </button>
          )}
          {!isDemo && gpu.webgpu && !isolated && (
            <p className="warn">
              スレッド分離がまだ有効ではありません。読込に失敗したら再読み込みしてください。
            </p>
          )}
        </section>

        <section className="panel" aria-label="測定値">
          <h2>
            02 測定
            <span>{result ? (result.demo ? "サンプル" : "実測") : "未測定"}</span>
          </h2>
          <div
            className="metrics"
            data-testid="run-complete"
            data-state={result ? "complete" : "idle"}
          >
            <Metric
              kind="decode"
              kana="スループット"
              en="decode tok/s"
              value={result ? formatTok(result.decodeTokPerS) : "—"}
              note={
                result
                  ? `サイクルタイム ${formatCycle(result.decodeTokPerS)}`
                  : "生成の速度"
              }
            />
            <Metric
              kind="ttft"
              kana="段取り時間"
              en="TTFT"
              value={result ? formatMs(result.ttftMs) : "—"}
              note="最初の1トークンまで"
            />
            <Metric
              kind="load"
              kana="立ち上げ"
              en="load"
              value={result ? formatLoad(result.loadMs) : "—"}
              note={
                result && result.loadMs < 400
                  ? "キャッシュ済み"
                  : "モデルを載せる時間"
              }
            />
            <Metric
              kind="prefill"
              kana="前工程"
              en="prefill tok/s"
              value={
                result?.prefillTokPerS ? formatTok(result.prefillTokPerS) : "—"
              }
              note="プロンプト処理"
            />
            <Metric
              kind="tokens"
              kana="出来高"
              en="total tokens"
              value={result ? String(result.totalTokens) : "—"}
              note={
                result
                  ? `入力 ${result.promptTokens} + 生成 ${result.completionTokens}`
                  : "入力 + 生成"
              }
            />
            <Metric
              kind="gpu"
              kana="設備"
              en="GPU"
              value={result ? result.gpu : gpu.webgpu ? gpu.name : "—"}
              note={
                result?.demo
                  ? "この欄はサンプルです"
                  : result
                    ? "測定に使ったアダプタ"
                    : "検出のみ。測定値ではない"
              }
            />
          </div>
          <div className="output">
            <header>
              <span>
                {isDemo ? "サンプル応答" : "生成テキスト"}
                {activeTitle ? ` · ${activeTitle}` : ""}
              </span>
              <span>
                {progress?.kind === "prompt"
                  ? `${progress.index + 1}/${progress.total}`
                  : result
                    ? `${result.prompts.length}問`
                    : "待機"}
              </span>
            </header>
            <div className="progress" aria-hidden="true">
              <span style={{ width: `${Math.round(loadProgress * 100)}%` }} />
            </div>
            <pre data-testid="live-output">
              {progress?.kind === "load"
                ? progress.text
                : liveText ||
                  (result
                    ? result.prompts
                        .map((prompt) => `【${prompt.title}】\n${prompt.text}`)
                        .join("\n\n")
                    : isDemo
                      ? "測定開始で、台本の応答を再生します。"
                      : "測定開始で、固定の作業標準をこのGPUに流します。")}
            </pre>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="panel" aria-label="比較と共有" data-testid="chart-section">
          <h2>
            03 比較
            <span>tok/s</span>
          </h2>
          <BarChart
            runs={history}
            selectedId={modelId}
            latestId={recent[0]?.id}
          />
          <p className="legend">
            <span>
              <i className={isDemo ? "swatch" : "swatch real"} />
              {isDemo ? "棒はサンプル" : "直近の実測"}
            </span>
            <span>機種ごとの最新</span>
          </p>
          <div className="card-wrap">
            {cardUrl ? (
              <img
                data-testid="share-card"
                src={cardUrl}
                alt={
                  preview?.demo
                    ? "サンプルの共有カード。実測ではありません"
                    : "測定結果の共有カード"
                }
              />
            ) : (
              <div className="card-placeholder">カードを作っています…</div>
            )}
          </div>
          <div className="card-actions">
            <button
              className="ghost"
              data-testid="export-png"
              onClick={onExport}
              disabled={!cardBlob}
            >
              PNGを保存
            </button>
            <span className="export-note">
              {exportNote ? (
                <span data-testid="export-status">{exportNote}</span>
              ) : null}
            </span>
          </div>
          <ol className="history" data-testid="history-list">
            {recent.slice(0, 3).map((run) => (
              <li key={run.id}>
                <span className="when">{formatWhen(run.createdAt)}</span>
                <span className="name">{run.modelLabel}</span>
                <span className="rate">{formatTok(run.decodeTokPerS)}</span>
                <span className={run.demo ? "badge demo" : "badge real"}>
                  {run.demo ? "サンプル" : "実測"}
                </span>
              </li>
            ))}
          </ol>
          <button
            className="ghost"
            style={{ alignSelf: "flex-start", marginTop: 6 }}
            onClick={() => {
              setHistory(clearHistory(isDemo));
              setResult(null);
            }}
          >
            履歴を消す
          </button>
        </section>
      </main>
      <footer className="foot">
        <span>
          {isDemo
            ? "このページの数値は録画用サンプルです。"
            : "プロンプトはサーバへ送りません。"}
        </span>
        <a href={PAGE_URL}>{PAGE_URL.replace("https://", "")}</a>
      </footer>
    </div>
  );
}

function ModelButton({
  model,
  pressed,
  disabled,
  onSelect,
}: {
  model: ModelOption;
  pressed: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="model"
      data-testid={`model-${model.slug}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="family">{model.family}</span>
      <span className="label">{model.label}</span>
      <span className="meta">
        {model.quant} · {model.vram} · {model.note}
      </span>
    </button>
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
