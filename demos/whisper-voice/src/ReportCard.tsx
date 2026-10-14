import { useState } from "react";

type Kind = "作業報告" | "ヒヤリハット" | "その他";

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function heading(kind: Kind): string {
  if (kind === "ヒヤリハット") return "ヒヤリハット報告";
  if (kind === "その他") return "報告メモ";
  return "作業日報";
}

export function ReportCard({ transcript, disabled }: { transcript: string | null; disabled: boolean }) {
  const [date, setDate] = useState(todayLocal);
  const [author, setAuthor] = useState("");
  const [kind, setKind] = useState<Kind>("作業報告");
  const [place, setPlace] = useState("");
  const [work, setWork] = useState("");
  const [body, setBody] = useState("");

  function placeTranscript() {
    if (transcript === null) return;
    setBody(transcript.trim());
  }

  return (
    <section className="card report">
      <h2>日報の欄</h2>
      <p className="what">
        文字起こしを、作業報告かヒヤリハットの欄に置くだけです。要約も分類もしていません。空欄は、まだ書いていない欄です。
      </p>
      <div className="report-sheet">
        <p className="report-title">{heading(kind)}</p>
        <div className="report-grid">
          <label>
            日付
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            報告者
            <input value={author} onChange={(event) => setAuthor(event.target.value)} autoComplete="name" />
          </label>
          <label>
            区分
            <select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
              <option>作業報告</option>
              <option>ヒヤリハット</option>
              <option>その他</option>
            </select>
          </label>
          <label>
            場所
            <input value={place} onChange={(event) => setPlace(event.target.value)} />
          </label>
          <label className="wide">
            作業
            <input value={work} onChange={(event) => setWork(event.target.value)} />
          </label>
        </div>
        <label className="body-label">
          聞き取った内容
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={8} />
        </label>
        <p className="what">日付の初期値は、この端末の暦です。本文はボタンを押したときだけ、今の文字起こしで置き換わります。</p>
      </div>
      <div className="actions no-print">
        <button type="button" onClick={placeTranscript} disabled={disabled || transcript === null}>
          本文を、今の文字起こしで置き換える
        </button>
        <button type="button" className="secondary" onClick={() => window.print()}>
          この日報を印刷
        </button>
      </div>
    </section>
  );
}
