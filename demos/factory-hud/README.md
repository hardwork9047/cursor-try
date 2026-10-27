# TACT タクト監視卓

架空の組立セルを眺める、生産技術向けの監視 HUD です。公開パスは `/cursor-try/factory-hud/` です。工場の設備にも、モデルの計測にも、繋がっていません。

パネルの中のタクト、件数、ミリ秒、欠陥数、軌跡、チャート、ログの文面は、画面上の動きを作るための演出です。画面には「演出用シミュレーション（実測ではない）」と出します。測っているのは、このページ自身の描画だけです。

- FPS
- フレーム時間（ミリ秒）
- 描画経路（`WebGPU HTML-in-Canvas` / `WebGPU only` / `DOM fallback`）
- GPU アダプタ名。取れなければ「—」

まだ出ていない欄は「—」のままです。この README に、測っていない秒数や件数は書きません。

## 動かし方

```bash
cd demos/factory-hud
npm ci
npm run dev
```

開発サーバは http://127.0.0.1:5173/cursor-try/factory-hud/ です。サイト全体は、リポジトリのルートで `npm run build` してから `npm run serve` し、http://127.0.0.1:4173/cursor-try/factory-hud/ です。

セクションは左のボタンか、キーの 1 から 7 です。中央の赤い停止は確認のあと STANDBY になり、起動で BOOTING から ONLINE に戻ります。どちらもこの画面の中だけの状態です。

## 描画経路

対応している Chrome では、HUD の DOM をキャンバスの `drawable` 部分木にして、`GPUQueue.drawElementImageToTexture()` でテクスチャに載せます。全画面のシェーダが、煙のような流体の背景と、色収差・わずかなワープ・走査線・弱いブルームを合成します。セクションを切り替えると、ワープが一度強くなって戻ります。ヒットテストは `updateElementGeometry()` でキャンバスの座標に合わせます。

古い試用実装向けに、`layoutsubtree` と `copyElementImageToTexture()` も見ます。有効かどうかは実行時に判定します。

WebGPU だけで HTML-in-Canvas が無いときは、背景だけシェーダにして、パネルは DOM のままです。どちらも無いときは、CSS の流体と DOM のパネルになり、次の文を出します。

> この環境では HTML-in-Canvas / WebGPU が使えないため、DOMフォールバック表示です

WebGPU はセキュアコンテキスト（HTTPS か localhost）が要ります。

## Chrome で HTML-in-Canvas を有効にする

2026-10-23 更新の [技術概念](https://developer.chrome.com/docs/web-platform/html-in-canvas/concepts) には、API は Chrome 157 で出荷とあります。同じ時期の [変更メモ](https://developer.chrome.com/blog/html-in-canvas-ot-changes) には、Origin Trial が Chrome 160 まで延びたともあります。このデモはドキュメントの判定そのままで、`canvas` に `content="drawable"` を付けて `canvas.content === "drawable"` なら使います。

手元でフラグが要るときは、次を Enabled にして Chrome を起動し直します。

`chrome://flags/#canvas-draw-element`

Canary でも同じフラグです。WebGPU の方は `chrome://gpu` で状態を見ます。

手順と API の詳細は Chrome のドキュメントです。

- [HTML-in-Canvas 概要](https://developer.chrome.com/docs/web-platform/html-in-canvas)
- [WebGPU への描画](https://developer.chrome.com/docs/web-platform/html-in-canvas/webgpu)
- [技術概念とフォールバック](https://developer.chrome.com/docs/web-platform/html-in-canvas/concepts)

## GitHub Pages で Origin Trial が要るとき

トークンはこのリポジトリに入れていません。発行できるのは、そのオリジンの登録者だけです。フラグや Canary で足りるデモなら、トークンは要りません。

Pages の訪問者に、フラグ無しの Chrome で HTML-in-Canvas を開かせる必要があり、その版がまだ Origin Trial の対象なら、次の手順です。

1. [Chrome Origin Trials](https://developer.chrome.com/origintrials/) を開く。
2. 一覧から HTML-in-Canvas のトライアルを選ぶ。コンソール上の名前は時期で変わるので、説明文で確認する。
3. Web Origin に `https://hardwork9047.github.io` を登録する。
4. 発行されたトークンを、`demos/factory-hud/index.html` の `<head>` に足す。

```html
<meta http-equiv="origin-trial" content="ここに発行されたトークン" />
```

推測で埋めた文字列はトークンになりません。localhost は、フラグがオンならこのメタタグ無しで試せます。

## 着想

画面の密度と、DOM をキャンバスに載せてシェーダで歪ませるやり方は、[@MatchaChoco010](https://x.com/MatchaChoco010) の HTML-in-Canvas + WebGPU ダッシュボードを見て作りました。相手の作品そのものではありません。名前、文言、数値、レイアウトは、工場のタクト監視向けに別に組んでいます。

- 投稿: https://x.com/MatchaChoco010/status/2114658986423439596
- 公開デモ: https://matchachoco010.github.io/demo-html-in-canvas-bot-dashboard/
- ソース: https://github.com/MatchaChoco010/demo-html-in-canvas-bot-dashboard
