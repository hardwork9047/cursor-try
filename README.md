# ブラウザ内ローカルLLM ベンチマーク

小さなオープンLLMを **ブラウザの WebGPU だけで** 動かし、立ち上げ時間・段取り時間（TTFT）・スループット（decode tok/s）・前工程（prefill tok/s）・出来高（トークン数）・GPU名を測る静的アプリです。プロンプトはサーバへ送りません。

画面に出る数字は、そのブラウザで実行した測定だけです。サンプルや再生用の数値はありません。まだ測っていない欄は「—」のままです。

公開先: https://hardwork9047.github.io/cursor-try/

推論には [@mlc-ai/web-llm 0.2.85](https://www.npmjs.com/package/@mlc-ai/web-llm) のビルド済みモデルを使います。

| 表示名 | model id | 目安VRAM |
| --- | --- | --- |
| Qwen3 0.6B | `Qwen3-0.6B-q4f16_1-MLC` | 約 1.4 GB |
| Llama 3.2 1B | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | 約 0.9 GB |
| Gemma 3 1B | `gemma3-1b-it-q4f16_1-MLC` | 約 0.7 GB |
| Phi-3.5 mini | `Phi-3.5-mini-instruct-q4f16_1-MLC-1k` | 約 2.5 GB |

Phi-3.5 はコンテキスト 1k です。メモリが足りないときは Qwen / Llama / Gemma にしてください。

## 測定条件

固定の作業標準が3問あります（内段取り、タクト計算、突発停止）。任意プロンプトを足せます。

- `max_tokens` 64
- `temperature` 0
- Qwen3 の思考トークンはオフ（`enable_thinking: false`）
- 段取り時間は、リクエスト開始から最初のトークンが画面に出るまで
- スループットと前工程は、WebLLM が返す `decode_tokens_per_s` / `prefill_tokens_per_s` を問ごとに加重平均
- 段取り時間の代表値は問ごとの中央値
- 初回の立ち上げには重みのダウンロードが含まれます。2回目以降はブラウザキャッシュで短くなります

結果は `localStorage` に残り、機種ごとの直近値を棒グラフにします。共有カードは PNG で保存でき、モデル名・大きな数字・GPU・日付・このページのURLが入ります。カードも、測定が終わるまで出ません。

## 使い方

Chrome または Edge の最新版で、ハードウェアアクセラレーションを有効にして開いてください。WebGPU が無いブラウザでは測定を始められず、その理由を表示します。代替の数値は出しません。

GitHub Pages は COOP / COEP ヘッダを付けられないため、`coi-serviceworker.js`（MIT, Guido Zuidhof）がクロスオリジン分離を足します。COEP は `credentialless` です。Hugging Face 上の重みと MLC の wasm を読むためです。初回アクセスで1回だけ再読み込みすることがあります。

## ローカル開発

```bash
npm ci
npm run dev      # http://127.0.0.1:5173/cursor-try/
npm run build
npm run preview  # http://127.0.0.1:4173/cursor-try/
```

ベースパスは `vite.config.ts` の `base: "/cursor-try/"` です。リポジトリ名を変えたらここを合わせてください。

## GitHub Pages（初回だけ手動）

ワークフローは `main` への push で動きます。公開までにあと一つ、リポジトリ設定が必要です。

1. GitHub のリポジトリで **Settings → Pages**
2. **Build and deployment** の **Source** を **GitHub Actions** にする
3. このリポジトリの `main` にワークフローを載せた状態で push する（PR をマージすれば足ります）
4. Actions の **Deploy GitHub Pages** が成功すると https://hardwork9047.github.io/cursor-try/ が更新されます

初回は `github-pages` 環境の承認を求められることがあります。Environment の待ちがあれば Approve してください。
