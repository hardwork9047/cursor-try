# ブラウザ内ローカルLLM ベンチマーク

小さなオープンLLMを **ブラウザの WebGPU だけで** 動かし、立ち上げ時間・段取り時間（TTFT）・スループット（decode tok/s）・前工程（prefill tok/s）・出来高（トークン数）・GPU名を測ります。

公開パスは [/cursor-try/llm/](https://hardwork9047.github.io/cursor-try/llm/) です。プロンプトも重みもサーバへ送りません。画面の数字は、そのブラウザで実行した測定だけです。見本の数値、種をまいた履歴、再生用の結果はありません。まだ測っていない欄は「—」です。

推論には [@mlc-ai/web-llm 0.2.85](https://www.npmjs.com/package/@mlc-ai/web-llm) のビルド済みモデルを使います。

| 表示名 | model id | 目安VRAM |
| --- | --- | --- |
| Qwen3 0.6B | `Qwen3-0.6B-q4f16_1-MLC` | 約 1.4 GB |
| Llama 3.2 1B | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | 約 0.9 GB |
| Gemma 3 1B | `gemma3-1b-it-q4f16_1-MLC` | 約 0.7 GB |
| Phi-3.5 mini | `Phi-3.5-mini-instruct-q4f16_1-MLC-1k` | 約 2.5 GB |

Phi-3.5 はコンテキスト 1k です。メモリが足りないときは Qwen / Llama / Gemma にしてください。目安の VRAM はモデルカードの大きさであり、このブラウザで測った速度ではありません。

## 測定条件

固定の作業標準が3問あります（内段取り、タクト計算、突発停止）。任意プロンプトを足せます。

- `max_tokens` 64
- `temperature` 0
- Qwen3 の思考トークンはオフ（`enable_thinking: false`）
- 段取り時間は、リクエスト開始から最初のトークンが画面に出るまで
- スループットと前工程は、WebLLM が返す `decode_tokens_per_s` / `prefill_tokens_per_s` を問ごとに加重平均
- 段取り時間の代表値は問ごとの中央値
- 初回の立ち上げには重みのダウンロードが含まれます。2回目以降はブラウザキャッシュで短くなります

結果は `localStorage` に残り、機種ごとの直近値を棒グラフにします。共有カードは PNG で保存でき、モデル名・大きな数字・GPU・日付・このページの URL が入ります。カードも、測定が終わるまで出ません。

Chrome または Edge の最新版で、ハードウェアアクセラレーションを有効にして開いてください。WebGPU が無いブラウザでは測定を始められず、その理由を表示します。代替の数値は出しません。

## クロスオリジン分離

GitHub Pages は COOP / COEP ヘッダを付けられないため、`public/coi-serviceworker.js`（MIT, Guido Zuidhof）がクロスオリジン分離を足します。COEP は `credentialless` です。Hugging Face 上の LLM の重みと、MLC の wasm を読むためです。初回アクセスで1回だけ再読み込みすることがあります。スコープはこのデモのパス `/cursor-try/llm/` です。ローカルの `vite` は同じヘッダをサーバ側で出します。

## ローカル

このフォルダだけで完結しています。

```bash
cd demos/llm
npm ci
npm run dev       # http://127.0.0.1:5173/cursor-try/llm/
npm run build
npm run preview   # http://127.0.0.1:4173/cursor-try/llm/
```

サイト全体（ギャラリーと他のデモ）は、リポジトリのルートで `npm run build` してから `npm run serve` です。ベースパスは `vite.config.ts` がフォルダ名から作る `/cursor-try/llm/` です。
