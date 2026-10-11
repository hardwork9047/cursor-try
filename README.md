# 現場のブラウザ

このサイトは、開いたブラウザの中だけで動く実験が二つあります。サーバへ画像もプロンプトも送りません。画面の数字は、そのブラウザで実行した測定だけです。見本の数値、種をまいた履歴、再生用の検出結果はありません。まだ測っていない欄は「—」です。

公開先: https://hardwork9047.github.io/cursor-try/

| ページ | パス | 内容 |
| --- | --- | --- |
| トップ | [/cursor-try/](https://hardwork9047.github.io/cursor-try/) | 二つの入口 |
| LLMベンチ | [/cursor-try/llm/](https://hardwork9047.github.io/cursor-try/llm/) | 小さなオープンLLMの速度 |
| YOLO26 | [/cursor-try/yolo/](https://hardwork9047.github.io/cursor-try/yolo/) | 一般検出、倉庫モード、ライン計数 |

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

## 倉庫・物流モード（YOLOE-26）

同じページの「倉庫・物流」は [YOLOE-26](https://docs.ultralytics.com/models/yoloe/) です。テキストは書き出し前に `set_classes(["forklift", "pallet", "cardboard box", "person"])` で焼き込んであり、ブラウザでは変えられません。セグメンテーション用チェックポイントの重みを検出用 YAML に載せ、マスク枝のない ONNX にしています。出力は `(1, 8, 8400)` で、NMS は YOLO26 と同じくブラウザ側です。

| ファイル | パラメータ | サイズ | 元チェックポイント |
| --- | --- | --- | --- |
| `public/models/yoloe-26n.onnx` | 4,789,402 | 9.4 MB | `yoloe-26n-seg.pt` |
| `public/models/yoloe-26s.onnx` | 13,091,762 | 36.4 MB | `yoloe-26s-seg.pt` |

```bash
# 概略。mobileclip2_b.ts は set_classes のときだけ使い、ONNX には入らない。
# 検出モデルへ載せ替えてから書き出す。
yoloe-26n-seg.pt  --set_classes-->  embeddings
yoloe-26n.yaml + embeddings + seg の重み  -->  onnx (opset 17, imgsz 640, simplify)
```

ライセンスは YOLO26 と同じ **AGPL-3.0** です。来歴は `public/models/NOTICE.txt`。

人とフォークリフトの箱のすき間（重なれば 0）が、画像の短辺に対する割合以下のとき、画面に接近の表示を出します。割合はスライダーです。ヒヤリハットの回数は、カメラか動画で、離れていた組が閾値の内側に入ったときだけ増えます。静止画ではいまのフレームの接近だけを出し、回数は「—」のままです。検出できていないクラスは接近判定に入りません。

### クラス文の試し

既定の4語と、言い換えを同じ10枚・信頼度 0.25・IoU 0.70 で比べました（Ultralytics 8.4.175、CPU）。`forklift truck` は孤立した機体のスコアが少し上がるだけで、人が乗った機体は拾えません。`stacked cardboard box` は段ボールの山の1枚だけ 0.45 になりましたが、ほかの写真では改善しません。言い換えは採用せず、指定の4語のままにしています。

### パレット専用モデルは入れていない

[EFFGRP/yolov11n-warehouse-pallets-640](https://huggingface.co/EFFGRP/yolov11n-warehouse-pallets-640)（モデルカードは Apache-2.0、ONNX のメタデータ文字列は Ultralytics 書き出しの AGPL 表記）を同じ画像にかけました。段ボールがパレットに載った1枚は 0.85 で正しく拾いました。一方、倉庫でフォークリフトに人が乗っている写真では、機体と人を覆う大きな箱をパレットとして 0.90 で出しました。物資を積んだパレットや、屋外で箱を扱う機体のパレットは 0.10 まで下げても 0 件です。誤検出の確信度が高いので、結果の結合はしていません。

### 実画像でのクラスごとの結果

2026年10月11日、信頼度 0.25、IoU 0.70、入力 640。PyTorch と、書き出した ONNX を ONNX Runtime 1.31.0 の CPU で推論した結果は一致しています。ブラウザの時間は、この環境の Chrome（ソフトウェア WebGPU）で測った値を、測り次第この節に足します。

| 写真 | 中身 | nano | small |
| --- | --- | --- | --- |
| フォークリフト（empilhadeira、PD） | 屋内の機体1台 | フォークリフト 0.52 と 0.43（1台に箱が2つ残る） | フォークリフト 0.25 が1つ |
| 小型機と人（Forklift.JPG、PD） | 人が乗った小型機 | 人 0.56。機体は出ない | 人 0.77、フォークリフト 0.40 |
| 段ボールの山（EFTA00002251、PD） | パレット上の段ボール | なし | 段ボール 0.32。パレットは出ない |
| 人と機体（Glacier、PD） | 人と、荷を扱う機体、パレット | 人 0.53 と 0.36。機体もパレットも出ない | 人 0.81 のみ |
| 物資のパレット（FEMA、PD） | 袋を積んだパレットと人 | 人 0.85。パレットは出ない | 人 0.86。パレットは出ない |
| 米海軍の搬入（PD、評価のみ） | 倉庫内の機体と運転者 | 人 0.41。機体は出ない | 人 0.64。機体は出ない |
| USAID の倉庫（PD、評価のみ） | 機体、運転者、奥の荷 | 人 0.88。機体は 0.15 で閾値外 | 人 0.84。機体は 0.13 で閾値外 |
| パレットジャッキ（Glacier、PD、評価のみ） | 人とジャッキ | 人 0.76 | 人 0.88 |
| 1942年の機体（CC0、評価のみ） | 古い屋外の機体 | なし | なし |
| トラック搭載機（CC0、評価のみ） | 平ボディ上の機体 | なし | なし |

よく出るのは **人** です。孤立した今のフォークリフトは nano でも出ます。small は、人が乗った小型機と、段ボールの山を追加で拾います。

弱いのは次です。

- **パレット** は、どちらの大きさでもほぼ出ません。信頼度を 0.10 まで下げても、公園の写真で 0.23 が最高で、袋を積んだパレットは 0 のままです。LVIS に pallet が無いオープン語彙の限界です。
- **人が乗ったフォークリフト** は、小型機の small 以外は落ちます。倉庫の実作業に近い写真ほど機体を落とします。
- **段ボール** は、山の1枚を small が 0.32 で拾う以外は出ません。
- 古い機体と、トラックに載った機体は両方とも 0 件です。

接近警報は、人とフォークリフトの両方が箱になったときだけ鳴ります。同梱サンプルでは、small の「小型機と人」がそれに当たります。nano や、人が機体を操作しているほかの写真では、機体が落ちるので警報は出ません。安全機能として十分ではありません。

次に精度を上げるなら、この4クラスで倉庫画像に追加学習する（LOCO はパブリックドメインですが、注釈付き一式は約 730MB のため同梱していません）、または視覚プロンプトです。テキストの言い換えだけではパレットは埋まりません。

### 倉庫サンプル（パブリックドメイン）

| ファイル | 作者 | ページ |
| --- | --- | --- |
| `public/samples/wh-forklift.jpg` | Onjacktallcuca | [Commons](https://commons.wikimedia.org/wiki/File:Forklift_truck_empilhadeira.JPG) |
| `public/samples/wh-small.jpg` | Marketing Team | [Commons](https://commons.wikimedia.org/wiki/File:Forklift.JPG) |
| `public/samples/wh-boxes.jpg` | Federal Bureau of Investigation | [Commons](https://commons.wikimedia.org/wiki/File:EFTA00002251_-_White_door_with_a_window_and_handle_stands_in_a_warehouse_next_to_stacked_cardboard_boxes_on_a_pallet.jpg) |
| `public/samples/wh-park.jpg` | GlacierNPS | [Commons](https://commons.wikimedia.org/wiki/File:Lifting_Park_Supplies_with_Forklift_(51966479517).jpg) |
| `public/samples/wh-pallets.jpg` | Jacinta Quesada / FEMA | [Commons](https://commons.wikimedia.org/wiki/File:Pallets_for_Gustav.jpg) |

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
