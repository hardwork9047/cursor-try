# 現場のブラウザ

このサイトは、開いたブラウザの中だけで動く実験が二つあります。サーバへ画像もプロンプトも送りません。画面の数字は、そのブラウザで実行した測定だけです。見本の数値、種をまいた履歴、再生用の検出結果はありません。まだ測っていない欄は「—」です。

公開先: https://hardwork9047.github.io/cursor-try/

| ページ | パス | 内容 |
| --- | --- | --- |
| トップ | [/cursor-try/](https://hardwork9047.github.io/cursor-try/) | 二つの入口 |
| LLMベンチ | [/cursor-try/llm/](https://hardwork9047.github.io/cursor-try/llm/) | 小さなオープンLLMの速度 |
| YOLO26 | [/cursor-try/yolo/](https://hardwork9047.github.io/cursor-try/yolo/) | 物体検出とライン計数 |

## ブラウザ内ローカルLLM ベンチマーク

小さなオープンLLMを **ブラウザの WebGPU だけで** 動かし、立ち上げ時間・段取り時間（TTFT）・スループット（decode tok/s）・前工程（prefill tok/s）・出来高（トークン数）・GPU名を測ります。

推論には [@mlc-ai/web-llm 0.2.85](https://www.npmjs.com/package/@mlc-ai/web-llm) のビルド済みモデルを使います。

| 表示名 | model id | 目安VRAM |
| --- | --- | --- |
| Qwen3 0.6B | `Qwen3-0.6B-q4f16_1-MLC` | 約 1.4 GB |
| Llama 3.2 1B | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | 約 0.9 GB |
| Gemma 3 1B | `gemma3-1b-it-q4f16_1-MLC` | 約 0.7 GB |
| Phi-3.5 mini | `Phi-3.5-mini-instruct-q4f16_1-MLC-1k` | 約 2.5 GB |

Phi-3.5 はコンテキスト 1k です。メモリが足りないときは Qwen / Llama / Gemma にしてください。

### 測定条件

固定の作業標準が3問あります（内段取り、タクト計算、突発停止）。任意プロンプトを足せます。

- `max_tokens` 64
- `temperature` 0
- Qwen3 の思考トークンはオフ（`enable_thinking: false`）
- 段取り時間は、リクエスト開始から最初のトークンが画面に出るまで
- スループットと前工程は、WebLLM が返す `decode_tokens_per_s` / `prefill_tokens_per_s` を問ごとに加重平均
- 段取り時間の代表値は問ごとの中央値
- 初回の立ち上げには重みのダウンロードが含まれます。2回目以降はブラウザキャッシュで短くなります

結果は `localStorage` に残り、機種ごとの直近値を棒グラフにします。共有カードは PNG で保存でき、モデル名・大きな数字・GPU・日付・LLMページのURLが入ります。カードも、測定が終わるまで出ません。

Chrome または Edge の最新版で、ハードウェアアクセラレーションを有効にして開いてください。WebGPU が無いブラウザでは測定を始められず、その理由を表示します。代替の数値は出しません。

## YOLO26 ブラウザ検出

2026年10月11日時点で、一般に入手できる最新の YOLO は **Ultralytics YOLO26**（2026年1月14日公開）です。公式ドキュメントの次世代プレビュー YOLO27 は、この時点では重みが公開されていません。検出には COCO 事前学習の nano を既定にし、任意で small に切り替えられます。

| ファイル | 元チェックポイント | 出力 |
| --- | --- | --- |
| `public/models/yolo26n.onnx` | `yolo26n.pt`（約 2.4M パラメータ） | `(1, 84, 8400)` |
| `public/models/yolo26s.onnx` | `yolo26s.pt`（約 9.5M パラメータ） | `(1, 84, 8400)` |

重みは [Ultralytics assets v8.4.0](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n.pt) の公式チェックポイントを、Ultralytics 8.4.175 で ONNX opset 17・入力 640・simplify 済みに書き出したものです。one-to-many ヘッドなので、信頼度としきい値 IoU の NMS はこのブラウザで行います。スライダーを動かすと、直前の出力に対して後処理だけをやり直します。

```bash
yolo export model=yolo26n.pt format=onnx imgsz=640 simplify=True opset=17 device=cpu
yolo export model=yolo26s.pt format=onnx imgsz=640 simplify=True opset=17 device=cpu
```

ライセンスは **AGPL-3.0** です。全文は `public/models/LICENSE-AGPL-3.0.txt`、来歴は `public/models/NOTICE.txt` にあります。社内の製品やラインへ組み込む場合は、Ultralytics の Enterprise License が別途必要です。画面のフッタにも同じことを書いてあります。

推論は [onnxruntime-web 1.30.0](https://www.npmjs.com/package/onnxruntime-web) です。WebGPU でセッションを作り、失敗したとき、または WebGPU が無いときは WASM に落ちます。使ったバックエンド名を表示します。WASM のバイナリはビルド時に `node_modules` から `dist/ort/` へコピーし、ページと同じオリジンから読みます。

入力は次の三つです。

- カメラ（ライブ）
- 画像ファイル
- 動画ファイル

加えて、検出をその場で計算するための CC0 サンプル画像が四つあります。箱・ラベル・信頼度、クラスごとの数、前処理 / 推論 / 後処理のミリ秒、モデル読込時間、FPS、バックエンド、WebGPU アダプタ名を出します。静止画の FPS は、その1枚の三つの時間から換算した値で、その旨を注記します。カメラと動画の FPS は、処理できたフレームの間隔です。推論が追いつかないフレームは飛ばします。

計数モードは、画面上の線を物体の重心が越えた回数を数えます。方向は上から下、または下から上です。搬送ラインの部品カウンタと同じ考え方で、カメラか動画のときだけ増えます。ラインを動かすと追跡だけ消し、それまでの通過数は残します。「通過数を戻す」でゼロに戻します。

PNG は 1200×675 で、いまのフレームに箱と、その実行の測定値を載せます。測定が終わるまで書き出せません。

### サンプル画像（CC0）

| ファイル | 作者 | ページ |
| --- | --- | --- |
| `public/samples/dog.jpg` | W.carter | [Commons](https://commons.wikimedia.org/wiki/File:Dog_at_N%C3%B8rre_Vorup%C3%B8r_Strand.jpg) |
| `public/samples/bicycle.jpg` | Wilfredor | [Commons](https://commons.wikimedia.org/wiki/File:Man_riding_a_bicycle_in_a_snowstorm_in_Quebec_city,_Quebec,_Canada.jpg) |
| `public/samples/bus.jpg` | Jonywikis | [Commons](https://commons.wikimedia.org/wiki/File:Bus_and_motorcycle_on_a_road_in_Lagos.jpg) |
| `public/samples/apples.jpg` | Nutrition, Food Safety & Health | [Commons](https://commons.wikimedia.org/wiki/File:Washed_apples_on_kitchen_towel_drying.jpg) |

## クロスオリジン分離

GitHub Pages は COOP / COEP ヘッダを付けられないため、`coi-serviceworker.js`（MIT, Guido Zuidhof）がクロスオリジン分離を足します。COEP は `credentialless` です。Hugging Face 上の LLM の重み、MLC の wasm、ONNX Runtime のスレッド wasm を読むためです。初回アクセスで1回だけ再読み込みすることがあります。ローカルの `vite` は同じヘッダをサーバ側で出します。

## ローカル開発

```bash
npm ci
npm run dev      # http://127.0.0.1:5173/cursor-try/
npm run build
npm run preview  # http://127.0.0.1:4173/cursor-try/
```

ベースパスは `vite.config.ts` の `base: "/cursor-try/"` です。リポジトリ名を変えたらここを合わせてください。エントリは `index.html`（トップ）、`llm/index.html`、`yolo/index.html` です。

## GitHub Pages

ワークフローは `main` への push で `npm run build` の `dist` を公開します。トップ、LLM、YOLO は同じ成果物に入ります。

1. GitHub のリポジトリで **Settings → Pages**
2. **Build and deployment** の **Source** を **GitHub Actions** にする
3. このリポジトリの `main` にワークフローを載せた状態で push する（PR をマージすれば足ります）
4. Actions の **Deploy GitHub Pages** が成功すると https://hardwork9047.github.io/cursor-try/ が更新されます

初回は `github-pages` 環境の承認を求められることがあります。Environment の待ちがあれば Approve してください。
