import { useEffect, useId, useRef } from "react";
import {
  BACKEND_LABEL,
  LOG_PHRASES,
  SECTIONS,
  STATUS_EN,
  formatMeasured,
  type LogLine,
  type RenderMetrics,
  type SectionId,
  type SimSnapshot,
  type Status,
} from "./model";
import {
  ClockCard,
  Console,
  Inspect,
  LaneCard,
  Memory,
  Metrics,
  Overview,
  Stations,
  TaktCard,
  Trajectory,
} from "./panels";

type Modal = "stop" | "start" | null;

export function Hud({
  section,
  onSection,
  status,
  sim,
  logs,
  now,
  metrics,
  modal,
  onOpenStop,
  onOpenStart,
  onCloseModal,
  onConfirmModal,
}: {
  section: SectionId;
  onSection: (id: SectionId) => void;
  status: Status;
  sim: SimSnapshot;
  logs: LogLine[];
  now: Date;
  metrics: RenderMetrics;
  modal: Modal;
  onOpenStop: () => void;
  onOpenStart: () => void;
  onCloseModal: () => void;
  onConfirmModal: () => void;
}) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modal) confirmRef.current?.focus();
  }, [modal]);

  useEffect(() => {
    if (section !== "console") return;
    const node = logRef.current?.querySelector(".log");
    if (node) node.scrollTop = node.scrollHeight;
  }, [section, logs]);

  const phrase = LOG_PHRASES[sim.tick % LOG_PHRASES.length] ?? "";

  return (
    <>
      <div className="hud-body" inert={modal ? true : undefined}>
        <header className="top">
          <div className="top-row">
            <a className="back" href="../">
              一覧
            </a>
            <div className="brand-block">
              <h1>TACT</h1>
              <p>タクト監視卓</p>
            </div>
            <div className="live">
              <span className={`live-status status-${status}`}>{STATUS_EN[status]}</span>
              {status === "standby" ? (
                <button type="button" className="mini-power mini-start" onClick={onOpenStart}>
                  起動
                </button>
              ) : (
                <button type="button" className="mini-power mini-stop" onClick={onOpenStop}>
                  停止
                </button>
              )}
            </div>
            <p className="sim-chip">演出用シミュレーション（実測ではない）</p>
            <p className="now-line">
              <span>いま</span>
              {phrase}
            </p>
          </div>
          {metrics.backend === "dom" ? (
            <p className="banner" role="status">
              この環境では HTML-in-Canvas / WebGPU が使えないため、DOMフォールバック表示です
            </p>
          ) : null}
          {metrics.backend === "webgpu" ? (
            <p className="banner" role="status">
              この環境では HTML-in-Canvas が使えないため、パネルは DOM 表示です。背景だけ WebGPU です。
            </p>
          ) : null}
          {metrics.backend === "pending" ? (
            <p className="banner banner-pending" role="status">
              描画経路を確認しています
            </p>
          ) : null}
        </header>

        <div className="board">
          <nav className="nav" aria-label="監視卓のセクション">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === section ? "page" : undefined}
                onClick={() => onSection(item.id)}
              >
                <span className="nav-no">{item.no}</span>
                <span className="nav-en">{item.en}</span>
                <span className="nav-ja">{item.ja}</span>
              </button>
            ))}
            <p className="hint">キー 1–7</p>
          </nav>

          <main className="main panel-swap" key={section}>
            {section === "overview" ? (
              <Overview status={status} onStop={onOpenStop} onStart={onOpenStart} />
            ) : null}
            {section === "stations" ? <Stations sim={sim} /> : null}
            {section === "inspect" ? <Inspect sim={sim} /> : null}
            {section === "memory" ? <Memory sim={sim} /> : null}
            {section === "trajectory" ? <Trajectory sim={sim} /> : null}
            {section === "metrics" ? <Metrics sim={sim} /> : null}
            {section === "console" ? (
              <div ref={logRef}>
                <Console lines={logs} />
              </div>
            ) : null}
          </main>

          <aside className="aside">
            <ClockCard now={now} />
            <TaktCard sim={sim} />
            <LaneCard sim={sim} />
          </aside>
        </div>

        <footer className="foot">
          <p>パネル内のタクト、件数、ms、欠陥、軌跡、チャート、ログの文面は演出です。</p>
          <dl className="measured">
            <div>
              <dt>この画面の描画</dt>
              <dd>実測</dd>
            </div>
            <div>
              <dt>FPS</dt>
              <dd>{formatMeasured(metrics.fps, 0)}</dd>
            </div>
            <div>
              <dt>フレーム</dt>
              <dd>{formatMeasured(metrics.frameMs, 1)} ms</dd>
            </div>
            <div>
              <dt>経路</dt>
              <dd>{BACKEND_LABEL[metrics.backend]}</dd>
            </div>
            <div>
              <dt>GPU</dt>
              <dd>{metrics.adapter}</dd>
            </div>
          </dl>
        </footer>
      </div>

      {modal ? (
        <div className="modal-back" onClick={onCloseModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">{modal === "stop" ? "STOP" : "START"}</p>
            <h2 id={titleId}>{modal === "stop" ? "監視を停止しますか" : "監視を始めますか"}</h2>
            <p>
              {modal === "stop"
                ? "演出上の状態を STANDBY にします。工場の設備には繋がっていません。"
                : "演出上の状態を BOOTING から ONLINE にします。実ラインへの出力はありません。"}
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={onCloseModal}>
                戻る
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={modal === "stop" ? "danger" : "go"}
                onClick={onConfirmModal}
              >
                {modal === "stop" ? "停止する" : "開始する"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
