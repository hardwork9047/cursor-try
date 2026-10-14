import { useEffect, useRef, useState } from "react";
import { decodeToPcm, drawWave, overPageLimit, recorderMime } from "./audio";
import { createEngine } from "./engine";
import { DASH, formatMs, formatRtf, formatSeconds, formatWhen } from "./format";
import { detectGpu } from "./gpu";
import {
  CODE_URL,
  MAX_AUDIO_SEC,
  MODEL_NAME,
  MODEL_REVISION,
  PAPER_URL,
  RUNTIME_NAME,
  RUNTIME_VERSION,
  UPSTREAM_URL,
  WEIGHTS_URL,
} from "./model";
import { ReportCard } from "./ReportCard";
import { renderShareCard } from "./shareCard";
import type { GpuInfo, LanguageChoice, WorkerOut } from "./types";

function errorText(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

export function App() {
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const onEventRef = useRef<(event: WorkerOut) => void>(() => {});
  const fileRef = useRef<HTMLInputElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedRef = useRef<number | null>(null);
  const samplesRef = useRef<Float32Array | null>(null);

  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [samples, setSamples] = useState<Float32Array | null>(null);
  const [audioSec, setAudioSec] = useState<number | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [transcribeMs, setTranscribeMs] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [language, setLanguage] = useState<LanguageChoice>("japanese");
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState<number | null>(null);
  const [liveWave, setLiveWave] = useState<Float32Array | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    samplesRef.current = samples;
  }, [samples]);

  useEffect(() => {
    const engine = createEngine((event) => onEventRef.current(event));
    engineRef.current = engine;
    return () => {
      engine.close();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    void detectGpu().then(setGpu);
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const started = recordStartedRef.current;
      if (started === null) return;
      setRecordSec((performance.now() - started) / 1000);
    }, 200);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    const canvas = waveRef.current;
    if (!canvas) return;
    const draw = () => drawWave(canvas, recording ? liveWave : samples);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [recording, liveWave, samples]);

  useEffect(() => {
    if (
      transcript === null ||
      transcribeMs === null ||
      audioSec === null ||
      loadMs === null ||
      !backend ||
      !ranAt ||
      !sourceLabel
    ) {
      setCardUrl(null);
      return;
    }
    try {
      const canvas = renderShareCard({
        transcript,
        transcribeMs,
        audioSec,
        loadMs,
        backend,
        ranAt,
        sourceLabel,
        adapterName: gpu?.name ?? "",
      });
      setCardUrl(canvas.toDataURL("image/png"));
    } catch (reason) {
      setCardUrl(null);
      setError(errorText(reason, "共有カードを描けません"));
    }
  }, [transcript, transcribeMs, audioSec, loadMs, backend, ranAt, sourceLabel, gpu]);

  onEventRef.current = (event) => {
    if (event.type === "progress") {
      setProgress(event.text);
      return;
    }
    if (event.type === "ready") {
      setLoadMs(event.loadMs);
      setBackend(event.backend);
      setNote(event.note);
      return;
    }
    if (event.type === "result") {
      setTranscript(event.transcript);
      setTranscribeMs(event.transcribeMs);
      setRanAt(new Date().toISOString());
      setProgress("");
      setRunning(false);
      setCopied("");
      return;
    }
    setError(event.message);
    setProgress("");
    setRunning(false);
  };

  function forgetAudio() {
    setSamples(null);
    setAudioSec(null);
    setSourceLabel(null);
    setTranscript(null);
    setTranscribeMs(null);
    setRanAt(null);
    setCardUrl(null);
    setCopied("");
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  async function takeBlob(blob: Blob, label: string) {
    try {
      const decoded = await decodeToPcm(blob);
      const url = URL.createObjectURL(blob);
      setAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      setSamples(decoded.samples);
      setAudioSec(decoded.durationSec);
      setSourceLabel(label);
      setTranscript(null);
      setTranscribeMs(null);
      setRanAt(null);
      setCardUrl(null);
      setCopied("");
      setError(
        overPageLimit(decoded.durationSec)
          ? `この音声は ${formatSeconds(decoded.durationSec)} あります。このページでは 5 分まで文字にします。`
          : "",
      );
    } catch (reason) {
      forgetAudio();
      setError(errorText(reason, "音声を読めません"));
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    recordStartedRef.current = null;
    setRecording(false);
    setRecordSec(null);
    setLiveWave(null);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    if (recording && recordSec !== null && recordSec >= MAX_AUDIO_SEC - 0.25) stopRecording();
  }, [recording, recordSec]);

  async function startRecording() {
    if (running || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("このブラウザはマイク録音に対応していません");
      return;
    }
    forgetAudio();
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = recorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        void takeBlob(blob, "マイクの録音");
      };
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const live = new Float32Array(analyser.fftSize);
      const timer = window.setInterval(() => {
        if (recorder.state === "inactive") {
          window.clearInterval(timer);
          void audioCtx.close();
          return;
        }
        analyser.getFloatTimeDomainData(live);
        setLiveWave(new Float32Array(live));
      }, 120);
      recorder.start();
      recorderRef.current = recorder;
      recordStartedRef.current = performance.now();
      setRecording(true);
      setRecordSec(0);
    } catch (reason) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(errorText(reason, "マイクを使えません"));
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || running || recording) return;
    forgetAudio();
    setError("");
    await takeBlob(file, file.name);
  }

  function transcribe() {
    const engine = engineRef.current;
    const audio = samplesRef.current;
    if (!engine || !audio || audioSec === null || running || recording || overPageLimit(audioSec)) return;
    setRunning(true);
    setError("");
    setCopied("");
    setProgress("始めています");
    setTranscript(null);
    setTranscribeMs(null);
    setRanAt(null);
    setCardUrl(null);
    engine.transcribe(audio, audioSec, language);
  }

  function cancel() {
    engineRef.current?.restart();
    setRunning(false);
    setProgress("");
    setError("中断しました。数字は、最後まで終わった実行だけです。");
  }

  async function copyTranscript() {
    if (transcript === null) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied("コピーしました");
    } catch (reason) {
      setCopied(errorText(reason, "コピーできません"));
    }
  }

  function downloadCard() {
    if (!cardUrl) return;
    const anchor = document.createElement("a");
    anchor.href = cardUrl;
    anchor.download = "whisper-voice.png";
    anchor.click();
  }

  const blocked = audioSec !== null && overPageLimit(audioSec);
  const transcriptShown = transcript === null ? "" : transcript.trim() ? transcript : "（モデルの出力は空でした）";

  return (
    <>
      <div className="topbar">
        <a href="../">現場のブラウザ</a>
        <span>音声</span>
      </div>
      <header className="mast">
        <div className="mast-inner">
          <p className="kicker">GENBA · 端末の中だけ</p>
          <h1>口頭の報告を文字にする</h1>
          <p className="lede">
            作業報告やヒヤリハットを、マイクか音声ファイルから、このブラウザの中で文字にします。音声と文字はサーバへ送りません。まだ測っていない欄は「{DASH}」です。
          </p>
        </div>
      </header>
      <main>
        <section className="env">
          <p>
            {MODEL_NAME}（多言語）です。モデル読込は、重みの取得とセッション作成です。文字起こしは、その呼び出しだけです。実時間比は、文字起こしの秒数を音声の長さで割った値です。音声のデコードは、どちらの時間にも入っていません。GPU の名前は、このページがアダプタから読んだものです。
          </p>
          <dl>
            <dt>バックエンド</dt>
            <dd>{backend ?? DASH}</dd>
            <dt>モデル読込</dt>
            <dd>{formatMs(loadMs)}</dd>
            <dt>音声の長さ</dt>
            <dd>{formatSeconds(audioSec)}</dd>
            <dt>文字起こし</dt>
            <dd>{formatMs(transcribeMs)}</dd>
            <dt>実時間比</dt>
            <dd>{formatRtf(transcribeMs, audioSec)}</dd>
            <dt>GPU</dt>
            <dd>{gpu?.name || DASH}</dd>
          </dl>
          {note ? <p className="note-line">{note}</p> : null}
          {gpu?.detail ? <p className="note-line">{gpu.detail}</p> : null}
          <p className="note-line">実行 {formatWhen(ranAt)}</p>
        </section>

        <div className="samples">
          <button type="button" onClick={() => void (recording ? stopRecording() : startRecording())} disabled={running}>
            {recording ? "録音を止める" : "マイクで録音"}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={running || recording}>
            音声ファイルを選ぶ
          </button>
          <label className="lang">
            言語
            <select
              value={language}
              disabled={running}
              onChange={(event) => setLanguage(event.target.value as LanguageChoice)}
            >
              <option value="japanese">日本語</option>
              <option value="auto">自動</option>
            </select>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.mp4,.webm,.ogg,.flac"
            hidden
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        <div className="actions">
          <button type="button" onClick={transcribe} disabled={!samples || running || recording || blocked}>
            この音声を文字にする
          </button>
          <button type="button" className="secondary" onClick={cancel} disabled={!running}>
            中断
          </button>
          <button type="button" className="secondary" onClick={downloadCard} disabled={!cardUrl}>
            共有カードを保存
          </button>
          {recording ? <span className="progress">録音中 {formatSeconds(recordSec)}</span> : null}
          {progress ? (
            <span className="progress" aria-live="polite">
              {progress}
            </span>
          ) : null}
          {error ? (
            <span className="error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
        <p className="credit">
          {sourceLabel ? sourceLabel : "音声はまだありません。"}
          {sourceLabel ? " · サンプル音声は同梱していません。" : " サンプル音声は同梱していません。"}
        </p>
        <canvas ref={waveRef} className="wave" aria-label={recording ? "録音中の波形" : "読み込んだ音声の波形"} />
        {audioUrl ? <audio className="playback" controls src={audioUrl} /> : null}

        <section className="card">
          <h2>文字起こし</h2>
          <p className="what">モデルが返した文です。直していません。翻訳もしていません。</p>
          <pre className="transcript">{transcript === null ? DASH : transcriptShown}</pre>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => void copyTranscript()} disabled={transcript === null}>
              文字をコピー
            </button>
            {copied ? <span className="progress">{copied}</span> : null}
          </div>
        </section>

        <ReportCard transcript={transcript} disabled={running} />

        {cardUrl ? (
          <section className="card">
            <h2>共有カード</h2>
            <p className="what">文字起こしが終わったあとだけ作ります。1200×675 の PNG です。</p>
            <img className="card-preview" src={cardUrl} alt="この実行の共有カード" width={1200} height={675} />
          </section>
        ) : null}

        <section className="note">
          <p>
            見本の文字起こしや、前の実行の再生はありません。雑音や無音では、話していない文が出ることがあります。このページでは {MAX_AUDIO_SEC / 60} 分までです。
          </p>
        </section>
      </main>
      <footer className="foot">
        <p>
          {MODEL_NAME} · 多言語 · ONNX {MODEL_REVISION.slice(0, 7)} · 実行 {RUNTIME_NAME} {RUNTIME_VERSION} ·{" "}
          <a href={UPSTREAM_URL}>上流の重み</a> · <a href={WEIGHTS_URL}>ONNX</a> · <a href={CODE_URL}>OpenAI のリポジトリ</a> ·{" "}
          <a href={PAPER_URL}>論文</a>
        </p>
        <p>
          OpenAI のリポジトリは、コードと重みを MIT としています。Hugging Face の openai/whisper-base のカードは Apache-2.0 とタグしています。初回は重みを Hugging Face から、WASM を CDN から取得します。音声は送りません。
        </p>
      </footer>
    </>
  );
}
