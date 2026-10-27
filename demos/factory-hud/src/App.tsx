import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Hud } from "./Hud";
import {
  LOG_PHRASES,
  SECTIONS,
  createSim,
  stepSim,
  type LogLine,
  type RenderMetrics,
  type SectionId,
  type Status,
} from "./model";
import { startStage, type Motion } from "./stage";

type Modal = "stop" | "start" | null;

export function App() {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motion = useRef<Motion>({ warp: 0, px: 0.5, py: 0.5 });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [section, setSection] = useState<SectionId>("overview");
  const [status, setStatus] = useState<Status>("booting");
  const [sim, setSim] = useState(createSim);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [modal, setModal] = useState<Modal>(null);
  const [metrics, setMetrics] = useState<RenderMetrics>({
    fps: null,
    frameMs: null,
    backend: "pending",
    adapter: "—",
  });
  const logId = useRef(1);
  const opener = useRef<HTMLElement | null>(null);
  const phaseLog = useRef<Status | null>(null);

  const pushLine = useCallback((text: string) => {
    const id = logId.current;
    logId.current += 1;
    const at = new Date();
    setLogs((prev) => [...prev, { id, at, text }].slice(-48));
  }, []);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    if (!shell || !canvas) return;
    const el = document.createElement("div");
    el.className = "hud-root";
    shell.appendChild(el);
    setHost(el);
    const handle = startStage({
      canvas,
      hud: el,
      motion: motion.current,
      onMetrics: setMetrics,
    });
    return () => {
      handle.stop();
      el.remove();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.backend = metrics.backend;
  }, [metrics.backend]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (phaseLog.current === status) return;
    phaseLog.current = status;
    if (status === "booting") pushLine("起動シーケンスを開始");
    if (status === "online") pushLine("状態を ONLINE にした");
    if (status === "standby") pushLine("監視卓を STANDBY にした");
  }, [status, pushLine]);

  useEffect(() => {
    if (status !== "booting") return;
    const id = window.setTimeout(() => setStatus("online"), 1800);
    return () => window.clearTimeout(id);
  }, [status]);

  useEffect(() => {
    if (status !== "online") return;
    let cursor = 0;
    const id = window.setInterval(() => {
      const text = LOG_PHRASES[cursor % LOG_PHRASES.length] ?? "状態を更新した";
      cursor += 1;
      pushLine(text);
    }, 1200);
    return () => window.clearInterval(id);
  }, [status, pushLine]);

  useEffect(() => {
    if (status !== "online") return;
    const id = window.setInterval(() => setSim((prev) => stepSim(prev)), 800);
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModal(null);
        return;
      }
      if (modal) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key);
      if (!Number.isInteger(index) || index < 1 || index > SECTIONS.length) return;
      const next = SECTIONS[index - 1];
      if (!next) return;
      choose(next.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function choose(id: SectionId) {
    setSection((current) => {
      if (current !== id && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        motion.current.warp = 1;
      }
      return id;
    });
  }

  function openModal(next: Modal) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setModal(next);
  }

  function closeModal() {
    setModal(null);
    opener.current?.focus();
  }

  function confirmModal() {
    if (modal === "stop") setStatus("standby");
    if (modal === "start") setStatus("booting");
    closeModal();
  }

  return (
    <div className="shell" ref={shellRef} data-backend={metrics.backend}>
      <div className="fluid-css" aria-hidden="true">
        <span className="orb a" />
        <span className="orb b" />
        <span className="orb c" />
        <svg className="turbulence" viewBox="0 0 100 100" preserveAspectRatio="none">
          <filter id="tact-smoke" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="4" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.45  0 0 0 0 0.95  0 0 0 0 0.84  0.9 0 0 0 -0.28"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#tact-smoke)" />
        </svg>
      </div>
      <div className="grid-overlay" aria-hidden="true" />
      <canvas ref={canvasRef} />
      <div className="scanlines" aria-hidden="true" />
      {host
        ? createPortal(
            <Hud
              section={section}
              onSection={choose}
              status={status}
              sim={sim}
              logs={logs}
              now={now}
              metrics={metrics}
              modal={modal}
              onOpenStop={() => openModal("stop")}
              onOpenStart={() => openModal("start")}
              onCloseModal={closeModal}
              onConfirmModal={confirmModal}
            />,
            host,
          )
        : null}
    </div>
  );
}
