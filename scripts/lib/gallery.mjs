import { escapeHtml } from "./html.mjs";
import { SITE_BASE, SITE_URL } from "./site.mjs";

function tags(item) {
  return item.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("");
}

function demoCard(item) {
  return `<article class="card">
        <div class="meta">
          <span class="status status-${escapeHtml(item.status)}">${escapeHtml(item.statusLabel)}</span>
          <time datetime="${escapeHtml(item.date)}">${escapeHtml(item.date)}</time>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <p class="tech">${escapeHtml(item.tech)}</p>
        <ul class="tags">${tags(item)}</ul>
        <div class="actions">
          <a class="go" href="./${escapeHtml(item.slug)}/">デモを開く</a>
          <a href="${escapeHtml(item.sourceUrl)}">ソース</a>
        </div>
      </article>`;
}

function toolCard(item) {
  return `<article class="card tool">
        <div class="meta">
          <span class="status status-${escapeHtml(item.status)}">${escapeHtml(item.statusLabel)}</span>
          <time datetime="${escapeHtml(item.date)}">${escapeHtml(item.date)}</time>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <p class="tech">${escapeHtml(item.tech)}</p>
        <ul class="tags">${tags(item)}</ul>
        <div class="actions">
          <a class="go" href="${escapeHtml(item.readmeUrl)}">説明を読む</a>
          <a href="${escapeHtml(item.sourceUrl)}">ソース</a>
        </div>
      </article>`;
}

export function renderGallery(catalog) {
  const demoCards = catalog.demos.map(demoCard).join("\n");
  const toolCards = catalog.tools.map(toolCard).join("\n");
  const toolBlock =
    catalog.tools.length === 0
      ? `<p class="empty">ツールはまだありません。</p>`
      : `<div class="grid">${toolCards}</div>`;

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>現場のブラウザ</title>
    <meta
      name="description"
      content="Junta の小さなデモを、同じ GitHub Pages に並べる場所です。速度や検出の数字は、その実行で測ったものだけです。"
    />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <style>
      :root {
        color-scheme: light;
        --ink: #1a1814;
        --paper: #e4dccb;
        --card: #fffdf8;
        --line: #2c2822;
        --muted: #5f594e;
        --yellow: #e2a30b;
        --green: #1d4f3a;
        --sans: "IBM Plex Sans JP", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif;
        --mono: "IBM Plex Mono", ui-monospace, monospace;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: var(--sans);
        color: var(--ink);
        background-color: var(--paper);
        background-image:
          linear-gradient(rgba(26, 24, 20, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(26, 24, 20, 0.04) 1px, transparent 1px);
        background-size: 22px 22px;
      }
      a { color: inherit; }
      :focus-visible { outline: 2px solid #8a6204; outline-offset: 2px; }
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 8px 16px;
        background: #12110e;
        color: #f4efe4;
        font-size: 12px;
      }
      .brand { font-weight: 700; letter-spacing: 0.08em; text-decoration: none; }
      .mast {
        padding: 28px 16px 8px;
        background: var(--ink);
        color: #f4efe4;
        border-bottom: 4px solid var(--yellow);
      }
      .mast-inner { max-width: 960px; margin: 0 auto; }
      .kicker {
        margin: 0 0 6px;
        color: var(--yellow);
        font-family: var(--mono);
        font-size: 11px;
        letter-spacing: 0.16em;
      }
      h1 { margin: 0; font-size: 40px; letter-spacing: -0.03em; line-height: 1.1; }
      .lede { margin: 8px 0 0; max-width: 40rem; color: #cfc6b6; font-size: 15px; line-height: 1.6; }
      main { max-width: 960px; margin: 0 auto; padding: 28px 16px 48px; }
      h2 {
        margin: 28px 0 12px;
        font-size: 13px;
        letter-spacing: 0.14em;
        font-family: var(--mono);
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 240px;
        padding: 16px;
        background: var(--card);
        border: 1px solid var(--line);
        border-top: 6px solid var(--yellow);
      }
      .card.tool { border-top-color: var(--green); }
      .meta { display: flex; justify-content: space-between; gap: 8px; font-family: var(--mono); font-size: 12px; }
      .status { font-weight: 700; }
      .status-ready { color: var(--green); }
      .status-wip { color: #8a6204; }
      time { color: var(--muted); }
      h3 { margin: 0; font-size: 22px; letter-spacing: -0.03em; line-height: 1.25; }
      .card p { margin: 0; line-height: 1.55; font-size: 14px; }
      .tech { color: var(--muted); font-family: var(--mono); font-size: 12px !important; }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
      .tags li {
        padding: 2px 6px;
        border: 1px solid var(--line);
        font-size: 11px;
        letter-spacing: 0.04em;
      }
      .actions { display: flex; gap: 14px; align-items: center; margin-top: auto; padding-top: 8px; }
      .go { font-weight: 700; font-size: 13px; }
      .empty { margin: 0; color: var(--muted); }
      .note { margin: 22px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
      .foot {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        max-width: 960px;
        margin: 0 auto;
        padding: 0 16px 28px;
        color: var(--muted);
        font-size: 12px;
      }
      @media (max-width: 800px) {
        h1 { font-size: 32px; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="topbar">
      <a class="brand" href="./">現場のブラウザ</a>
      <span>デモ ${catalog.demos.length} · ツール ${catalog.tools.length}</span>
    </div>
    <header class="mast">
      <div class="mast-inner">
        <p class="kicker">GENBA · 並べて出す</p>
        <h1>現場のブラウザ</h1>
        <p class="lede">
          小さなデモを、同じ GitHub Pages に置いています。依存もビルドも分かれていて、一つが失敗すると、どれが壊れたかを出して公開を止めます。
        </p>
      </div>
    </header>
    <main>
      <h2>DEMOS</h2>
      <div class="grid">
        ${demoCards}
      </div>
      <h2>TOOLS</h2>
      ${toolBlock}
      <p class="note">
        速度や検出の数字は、その実行で測ったものだけです。見本の数値、種をまいた履歴、再生用の結果は置いていません。まだ測っていない欄は「—」です。
      </p>
    </main>
    <footer class="foot">
      <span>数字は、開いた環境が測ったものだけです。</span>
      <a href="${escapeHtml(SITE_URL)}">${escapeHtml(SITE_URL.replace("https://", ""))}</a>
    </footer>
    <script>
      if (navigator.serviceWorker) {
        var scopes = ${JSON.stringify([SITE_BASE, SITE_BASE.replace(/\/$/, "")])};
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (reg) {
            try {
              var path = new URL(reg.scope).pathname;
              if (scopes.indexOf(path) !== -1) reg.unregister();
            } catch (e) {}
          });
        });
      }
    </script>
  </body>
</html>
`;
}
