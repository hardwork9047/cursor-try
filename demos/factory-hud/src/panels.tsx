import {
  MEMORY_LINKS,
  MEMORY_NODES,
  STATUS_EN,
  STATUS_JA,
  TRAJECTORY,
  type SimSnapshot,
  type Status,
  formatClockDate,
  formatClockTime,
  trajectoryOffsets,
} from "./model";

const BARS = [2, 1, 1, 3, 1, 2, 1, 4, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 4, 1, 2, 1];

export function Barcode() {
  return (
    <div className="barcode" aria-hidden="true">
      {BARS.map((width, index) => (
        <i key={index} style={{ width }} />
      ))}
    </div>
  );
}

function SimNote() {
  return <p className="fine">演出用シミュレーション（実測ではない）</p>;
}

function Slab({ no, en, ja }: { no: string; en: string; ja: string }) {
  return (
    <div className="slab">
      <span className="slab-no">{no}</span>
      <span className="slab-en">{en}</span>
      <span className="slab-ja">{ja}</span>
    </div>
  );
}

export function Overview({
  status,
  onStop,
  onStart,
}: {
  status: Status;
  onStop: () => void;
  onStart: () => void;
}) {
  return (
    <section className="hero" aria-labelledby="hero-status">
      <div className="rings" aria-hidden="true">
        <i className="ring ticks" />
        <i className="ring r2" />
        <i className="ring r3" />
        <i className="crosshair" />
      </div>
      <div className="hero-stack">
        <p className="eyebrow">CELL-B · 組立セル · 架空の監視卓</p>
        <p className="mark" aria-hidden="true">
          TACT
        </p>
        <p className="ruby">タクト</p>
        <p id="hero-status" className={`status-word status-${status}`} aria-live="polite">
          {STATUS_EN[status]}
        </p>
        <p className="status-ja">{STATUS_JA[status]}</p>
        {status === "booting" ? (
          <div className="boot">
            <span>起動シーケンス（演出）</span>
            <i />
          </div>
        ) : null}
        {status === "standby" ? (
          <button type="button" className="power power-start" onClick={onStart}>
            <span>起動</span>
            <small>START</small>
          </button>
        ) : (
          <button type="button" className="power power-stop" onClick={onStop}>
            <span>停止</span>
            <small>STOP</small>
          </button>
        )}
        <Barcode />
      </div>
      <p className="vlabel">LINE MONITOR</p>
    </section>
  );
}

export function Stations({ sim }: { sim: SimSnapshot }) {
  return (
    <section className="card section-card">
      <Slab no="02" en="STATIONS" ja="工程レーン" />
      <ol className="lanes">
        {sim.stations.map((station) => (
          <li key={station.id} className={station.id === sim.bottleneckId ? "hot" : undefined}>
            <span className="lane-id">{station.id}</span>
            <span className="lane-name">
              <b>{station.en}</b>
              <small>{station.ja}</small>
            </span>
            <span className="meter" aria-hidden="true">
              <i style={{ width: `${Math.round(station.load * 100)}%` }} />
            </span>
            <span className="lane-num">
              {station.jobs}
              <small>件</small>
            </span>
            <span className="lane-num">
              {Math.round(station.p90)}
              <small>ms</small>
            </span>
          </li>
        ))}
      </ol>
      <SimNote />
    </section>
  );
}

export function Inspect({ sim }: { sim: SimSnapshot }) {
  const peak = Math.max(8, ...sim.defects.map((defect) => defect.count));
  return (
    <section className="card section-card inspect">
      <Slab no="03" en="INSPECT" ja="外観" />
      <div className="inspect-grid">
        <svg className="work" viewBox="0 0 280 200" role="img" aria-label="ワークの模式図（演出）">
          <rect x="28" y="24" width="224" height="152" rx="8" className="work-body" />
          <circle cx="78" cy="72" r="16" />
          <circle cx="200" cy="72" r="16" />
          <rect x="64" y="112" width="152" height="28" rx="4" />
          <rect className="scan" x="36" y="30" width="208" height="3" />
        </svg>
        <ul className="defects">
          {sim.defects.map((defect) => (
            <li key={defect.id}>
              <span>{defect.ja}</span>
              <span className="meter" aria-hidden="true">
                <i style={{ width: `${Math.round((defect.count / peak) * 100)}%` }} />
              </span>
              <b>{defect.count}</b>
            </li>
          ))}
        </ul>
      </div>
      <SimNote />
    </section>
  );
}

export function Memory({ sim }: { sim: SimSnapshot }) {
  const byId = new Map<string, (typeof MEMORY_NODES)[number]>(
    MEMORY_NODES.map((node) => [node.id, node]),
  );
  return (
    <section className="card section-card">
      <Slab no="04" en="MEMORY" ja="工程の知見" />
      <svg className="graph" viewBox="0 0 600 390" role="img" aria-label="知見のつながり（演出）">
        {MEMORY_LINKS.map(([from, to]) => {
          const a = byId.get(from);
          const b = byId.get(to);
          if (!a || !b) return null;
          return (
            <line
              key={`${from}-${to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}
        {MEMORY_NODES.map((node) => {
          const heat = sim.heats[node.id] ?? 0.4;
          const radius = 16 + heat * 14;
          return (
            <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
              <circle r={radius} style={{ opacity: 0.35 + heat * 0.65 }} />
              <text y={radius + 16}>{node.label}</text>
            </g>
          );
        })}
      </svg>
      <SimNote />
    </section>
  );
}

export function Trajectory({ sim }: { sim: SimSnapshot }) {
  const marks = trajectoryOffsets(sim.tick);
  return (
    <section className="card section-card">
      <Slab no="05" en="TRAJECTORY" ja="判断の流れ" />
      <ol className="timeline">
        {TRAJECTORY.map((step, index) => (
          <li key={step.en}>
            <span className="time">+{marks[index]?.toFixed(1)}s</span>
            <span className="dot" aria-hidden="true" />
            <span>
              <b>{step.en}</b>
              <small>{step.ja}</small>
            </span>
          </li>
        ))}
      </ol>
      <SimNote />
    </section>
  );
}

function Chart({ values, label, unit }: { values: number[]; label: string; unit: string }) {
  const width = 360;
  const height = 112;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * (width - 8) + 4;
    const y = height - 14 - ((value - min) / span) * (height - 28);
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width - 4} ${height} L4 ${height} Z`;
  const latest = values[values.length - 1] ?? 0;
  return (
    <figure className="chart">
      <figcaption>
        <span>{label}</span>
        <strong>
          {latest.toFixed(1)}
          <small>{unit}</small>
        </strong>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}（演出）`}>
        <path className="chart-area" d={area} />
        <path className="chart-line" d={line} />
      </svg>
    </figure>
  );
}

export function Metrics({ sim }: { sim: SimSnapshot }) {
  return (
    <section className="card section-card">
      <Slab no="06" en="METRICS" ja="推移" />
      <div className="charts">
        <Chart values={sim.series.cycle} label="サイクル" unit="s" />
        <Chart values={sim.series.queue} label="滞留" unit="件" />
        <Chart values={sim.series.defects} label="欠陥合計" unit="件" />
      </div>
      <SimNote />
    </section>
  );
}

export function Console({
  lines,
}: {
  lines: { id: number; at: Date; text: string }[];
}) {
  return (
    <section className="card section-card console">
      <Slab no="07" en="CONSOLE" ja="監視ログ" />
      <div className="log" tabIndex={0}>
        {lines.length === 0 ? <p className="fine">まだ行がありません</p> : null}
        {lines.map((line) => (
          <p key={line.id}>
            <time dateTime={line.at.toISOString()}>{formatClockTime(line.at)}</time>
            <span className="log-tag">演出</span>
            <span>{line.text}</span>
          </p>
        ))}
      </div>
      <p className="fine">時刻はこの端末の時計。文面は演出です。</p>
    </section>
  );
}

export function ClockCard({ now }: { now: Date }) {
  return (
    <section className="card side-card">
      <Slab no="00" en="CLOCK" ja="端末時刻" />
      <p className="clock-time">{formatClockTime(now)}</p>
      <p className="clock-date">{formatClockDate(now)}</p>
      <p className="fine">このブラウザの現地時刻</p>
    </section>
  );
}

export function TaktCard({ sim }: { sim: SimSnapshot }) {
  const hot = sim.stations.find((station) => station.id === sim.bottleneckId);
  return (
    <section className="card side-card">
      <Slab no="T" en="TAKT" ja="間隔" />
      <p className="big-num">
        {sim.taktSec.toFixed(1)}
        <small>s</small>
      </p>
      <p className="hot-line">
        長め <b>{hot?.ja ?? "—"}</b>
        <span>{hot?.en}</span>
      </p>
      <SimNote />
    </section>
  );
}

export function LaneCard({ sim }: { sim: SimSnapshot }) {
  return (
    <section className="card side-card">
      <Slab no="L" en="LOAD" ja="レーン" />
      <ul className="mini-lanes">
        {sim.stations.map((station) => (
          <li key={station.id}>
            <span>{station.ja}</span>
            <span className="meter" aria-hidden="true">
              <i style={{ width: `${Math.round(station.load * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <SimNote />
    </section>
  );
}
