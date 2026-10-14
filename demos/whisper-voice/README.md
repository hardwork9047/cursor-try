# 口頭の報告を文字にする

マイクか音声ファイルの作業報告・ヒヤリハットを、開いたブラウザの中だけで文字にします。見本の文字起こしや、前の実行の再生はありません。まだ測っていない欄は「—」です。共有カードは、その実行が終わったあとだけ作ります。

公開パスは [/cursor-try/whisper-voice/](https://hardwork9047.github.io/cursor-try/whisper-voice/) です。

音声と文字起こしはサーバへ送りません。初回だけ、モデルの重みを Hugging Face から、ONNX Runtime の WASM を CDN から、このブラウザが取得します。

## モデル

| 項目 | 内容 |
| --- | --- |
| 名前 | Whisper base（多言語。英語専用の `.en` ではない） |
| 上流 | [openai/whisper-base](https://huggingface.co/openai/whisper-base) |
| このデモが読む ONNX | [onnx-community/whisper-base](https://huggingface.co/onnx-community/whisper-base/tree/1846881b6b3a3024392c1eea3ad983695bc23925) |
| リビジョン | `1846881b6b3a3024392c1eea3ad983695bc23925` |
| 実行 | [@huggingface/transformers](https://github.com/huggingface/transformers.js) 4.3.1（Apache-2.0） |
| 論文 | [Robust Speech Recognition via Large-Scale Weak Supervision](https://arxiv.org/abs/2212.04356) |

ライセンスは、出どころで表記が分かれています。

- [OpenAI の whisper リポジトリ](https://github.com/openai/whisper) は、コードと重みを MIT として公開しています。
- Hugging Face の `openai/whisper-base` のモデルカード先頭は `license: apache-2.0` です。
- `onnx-community/whisper-base` は、その重みの Transformers.js 向け ONNX です。変換元は `openai/whisper-base` で、変換リポジトリ自体は別のライセンス文を置いていません。

MIT も Apache-2.0 も、この公開デモに載せられる許諾です。重みはコミットしません。

WebGPU ではエンコーダを fp32、デコーダを q4 で読みます。WebGPU をワーカーから使えないとき、セッションを作れないとき、文字起こしが失敗したときは、WASM に落ちます。WASM はエンコーダ fp32 とデコーダ q8 を試し、それもダメなら両方 fp32 です。画面のバックエンドは、できたセッションの装置名です。読込時間は、成功した読み込みだけを測ります。

30 秒を超える音声は、30 秒の塊に 5 秒の重なりを付けて渡します。言語は、既定で日本語を指定します。「自動」はモデルに任せます。翻訳はしません。

Whisper base は小さい多言語モデルです。現場の雑音、早口、専門用語では取りこぼします。無音や雑音では、話していない文が出ることがあります。出た文は下書きです。

## 画面の数字

| 欄 | 測り方 |
| --- | --- |
| モデル読込 | `pipeline` が解決するまで。取得とセッション作成を含む。成功した試行だけ |
| 音声の長さ | デコードした `AudioBuffer.duration` |
| 文字起こし | モデル呼び出しの前後。デコードは含まない |
| 実時間比 | 文字起こしの秒数 ÷ 音声の長さ |
| バックエンド | セッションに付いた `webgpu` か `wasm` |
| GPU | ページが `requestAdapter` で読んだアダプタ名。文字起こしとは別 |

このページでは 5 分までの音声にしています。これは上限であり、測定結果ではありません。サンプル音声は同梱していません。

日報の欄は、文字起こしをフォームに置くだけです。要約も、ヒヤリハットかどうかの判定もしていません。日付の初期値は、開いた端末の暦です。

共有カードは 1200×675 の PNG で、文字起こしが終わったあとだけ作ります。

## 入力

マイクの録音か、音声ファイルです。ブラウザがデコードできる形式（WAV、MP3、M4A、WebM、Ogg、FLAC など）に限ります。波形は、録音中のマイクか、読み込んだ波形です。

GitHub Pages は COOP / COEP ヘッダを付けられないため、`public/coi-serviceworker.js`（MIT, Guido Zuidhof）がクロスオリジン分離を足します。COEP は `credentialless` です。Hugging Face の重みと、ONNX Runtime の WASM を読むためです。初回アクセスで 1 回だけ再読み込みすることがあります。スコープはこのデモのパス `/cursor-try/whisper-voice/` です。ローカルの `vite` は同じヘッダをサーバ側で出します。

## ビルド

このデモだけの依存です。

```bash
cd demos/whisper-voice
npm ci
npm run dev       # http://127.0.0.1:5177/cursor-try/whisper-voice/
npm run build
```

サイト全体は、リポジトリのルートで `npm run build` です。
