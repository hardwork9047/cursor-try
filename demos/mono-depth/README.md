# 一枚の写真から奥行き

一枚の画像から、開いたブラウザの中だけで相対的な奥行きを推定します。見本の奥行き図や、前の実行の再生はありません。まだ測っていない欄は「—」です。共有カードは、その実行が終わったあとだけ作ります。

公開パスは [/cursor-try/mono-depth/](https://hardwork9047.github.io/cursor-try/mono-depth/) です。

## モデル

| 項目 | 内容 |
| --- | --- |
| 名前 | Depth Anything V2 Small（24.8M） |
| ライセンス | Apache-2.0。全文は `public/models/LICENSE-APACHE-2.0.txt` |
| 論文 | [Depth Anything V2](https://arxiv.org/abs/2406.09414)（Yang ほか、NeurIPS 2024） |
| 重みの出典 | [onnx-community/depth-anything-v2-small](https://huggingface.co/onnx-community/depth-anything-v2-small/tree/64fe43eba7f8a384b02fe3fadaa26cbba35548d8) の `onnx/model_fp16.onnx` |
| リビジョン | `64fe43eba7f8a384b02fe3fadaa26cbba35548d8` |
| SHA-256 | `2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04` |

Small だけが Apache-2.0 です。Base、Large、Giant は CC-BY-NC-4.0 なので、この公開デモでは使いません。

出力は相対値です。メートルではありません。モデルの値が大きいほど手前です。画面では黄が手前、青が奥です。点群は、その相対値で点を浮かせただけで、実寸の立体ではありません。

推論は Web Worker の中です。先に WebGPU を試し、セッションを作れないときは WASM に落ちます。短い辺が 518 px 前後、14 の倍数になるようキャンバスで縮め、ImageNet の平均と標準偏差で正規化してから入れます。縮小は測定の外です。推論の時間は `session.run` だけです。

## 入力

画像ファイル、カメラの一枚、同梱の三枚から選べます。推定は「この画像で推定」を押したときだけ走ります。

| ファイル | 画面の名前 | 作者 | ライセンス | ページ |
| --- | --- | --- | --- | --- |
| `public/samples/forklift.jpg` | フォークリフト | Onjacktallcuca | パブリックドメイン | [Commons](https://commons.wikimedia.org/wiki/File:Forklift_truck_empilhadeira.JPG) |
| `public/samples/boxes.jpg` | 段ボールの山 | Federal Bureau of Investigation | パブリックドメイン | [Commons](https://commons.wikimedia.org/wiki/File:EFTA00002251_-_White_door_with_a_window_and_handle_stands_in_a_warehouse_next_to_stacked_cardboard_boxes_on_a_pallet.jpg) |
| `public/samples/pallets.jpg` | 物資のパレット | Jacinta Quesada / FEMA | パブリックドメイン | [Commons](https://commons.wikimedia.org/wiki/File:Pallets_for_Gustav.jpg) |

## ビルド

このデモだけの依存です。`npm run build` が、上の SHA-256 の ONNX を Hugging Face から `public/models/` に取ります。既にあってハッシュが合うときは取り直しません。重みはコミットしません。

```bash
cd demos/mono-depth
npm ci
npm run dev       # http://127.0.0.1:5176/cursor-try/mono-depth/
npm run build
```

サイト全体は、リポジトリのルートで `npm run build` です。
