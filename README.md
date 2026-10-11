# 現場のブラウザ

Junta の小さなデモを、同じ GitHub Pages に並べる場所です。Web のデモと、ブラウザに載らないツールを分けて置きます。デモは一つずつ独立していて、依存もビルドも隣と混ぜません。

公開先: https://hardwork9047.github.io/cursor-try/

速度や検出の数字は、その実行で測ったものだけです。見本の数値、種をまいた履歴、再生用の結果は置いていません。まだ測っていない欄は「—」です。

| 種類 | 場所 | 公開 |
| --- | --- | --- |
| ギャラリー | ルートの `npm run build` が `dist/index.html` を作る | [/cursor-try/](https://hardwork9047.github.io/cursor-try/) |
| ブラウザ内ローカルLLMベンチ | [`demos/llm/`](demos/llm/) | [/cursor-try/llm/](https://hardwork9047.github.io/cursor-try/llm/) |
| YOLO26 ブラウザ検出 | [`demos/yolo/`](demos/yolo/) | [/cursor-try/yolo/](https://hardwork9047.github.io/cursor-try/yolo/) |
| Voxel Pagoda Garden | [`demos/pagoda-garden/`](demos/pagoda-garden/) | [/cursor-try/pagoda-garden/](https://hardwork9047.github.io/cursor-try/pagoda-garden/) |
| ローカルLLM 同時リクエスト測定 | [`tools/llm-concurrency-bench/`](tools/llm-concurrency-bench/) | Pages には載せず、カードから README とソースへ |

ギャラリーのカードは、各フォルダの `demo.json` / `tool.json` から作ります。手で一覧を書き足す必要はありません。

## デモを足す

Web に出すものは `demos/<slug>/`、CLI やキットは `tools/<slug>/` です。slug は小文字・数字・ハイフンです。

```bash
npm run new-demo -- pallet-count                  # 一枚の HTML
npm run new-demo -- pallet-count --template vite  # Vite + React + TypeScript
npm run new-tool -- line-balance                   # ブラウザに載らないツール
```

スクリプトが型をコピーし、`demo.json` または `tool.json` を埋めます。そのあと title、description、tags、tech を書き換え、README と中身をそのフォルダの中だけで実装します。公開できる状態になったら `status` を `ready` にします。作業中は `wip` のままにしてください。

型の中身は [`templates/`](templates/) にあります。静的 HTML と Vite のどちらでも、フレームワークを強制しません。

メタデータの項目は次だけです。

| 項目 | 意味 |
| --- | --- |
| `title` | カードの見出し |
| `description` | 一文から二文。測っていない数値は書かない |
| `tags` | 短いラベルの配列 |
| `date` | `YYYY-MM-DD` |
| `tech` | モデルや技術の名前 |
| `status` | `ready`（公開）または `wip`（作業中） |

slug はフォルダ名です。JSON には書きません。公開パスは `/cursor-try/<slug>/` です。

足したあとは、リポジトリのルートでビルドが通ることを確認します。一つのデモが失敗すると、サイト全体の公開は止まり、ログにその slug が出ます。

```bash
npm run build
npm run serve    # http://127.0.0.1:4173/cursor-try/
```

`npm run serve` は、GitHub Pages と同じく成果物を `/cursor-try/` の下に出します。ヘッダは Pages と同様、サーバ側では COOP / COEP を付けません。必要なデモは自分の service worker で足します。

一つのデモだけ触るときは、そのフォルダで `npm ci` して `npm run dev` です。LLM はポート 5173、YOLO は 5174 です。

```text
http://127.0.0.1:5173/cursor-try/llm/
http://127.0.0.1:5174/cursor-try/yolo/
```

## 置いてあるもの

各デモの測り方、ライセンス、サンプル画像の出典は、そのフォルダの README にあります。

- [ブラウザ内ローカルLLMベンチ](demos/llm/README.md)。WebGPU と WebLLM。重みはブラウザの外へ出ません。
- [YOLO26 ブラウザ検出](demos/yolo/README.md)。YOLO26 と倉庫向け YOLOE-26。重みは **AGPL-3.0** です。サンプル画像のクレジットもそこにあります。
- [Voxel Pagoda Garden](demos/pagoda-garden/README.md)。単一 HTML。`index.html` は Grok 4.7 の一発出力で、バイト列は変えていません。
- [ローカルLLM 同時リクエスト測定](tools/llm-concurrency-bench/README.md)。手元の LLM サーバへ同時リクエストを送る Python のキットです。図は、その実行の数値だけから描きます。

## GitHub Pages

ワークフローは `.github/workflows/pages.yml` です。`main` への push で、各 Web デモをビルドし、静的 HTML をコピーし、ギャラリーを足して `dist` を公開します。

1. GitHub のリポジトリで **Settings → Pages**
2. **Build and deployment** の **Source** を **GitHub Actions** にする
3. このリポジトリの `main` にワークフローを載せた状態で push する（PR をマージすれば足ります）
4. Actions の **Deploy GitHub Pages** が成功すると https://hardwork9047.github.io/cursor-try/ が更新されます

初回は `github-pages` 環境の承認を求められることがあります。Environment の待ちがあれば Approve してください。

リポジトリ名を変えたときは、`scripts/lib/site.mjs` の `SITE_REPO`、各デモの `vite.config.ts` と画面内リンク、`scripts/serve-site.mjs` が読む同じ定数を合わせてください。ビルドは、成果物の絶対パスが `/cursor-try/<slug>/` で始まらないときに失敗します。

## エージェントへ

新しいデモを足す手順と、触ってはいけないものの境界は [AGENTS.md](AGENTS.md) にあります。
