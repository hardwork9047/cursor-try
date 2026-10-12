# このリポジトリで作業するエージェントへ

持ち主は Junta です。現場の生産技術で、小さな AI デモを X に出すための置き場です。デモはこれから何度も足されます。一つの追加が、隣のデモを壊さないことが最優先です。

UI と README は日本語で書いてください。

## 置き場

| 種類 | パス | メタデータ | Pages |
| --- | --- | --- | --- |
| Web デモ | `demos/<slug>/` | `demo.json` | `/cursor-try/<slug>/` |
| CLI やキット | `tools/<slug>/` | `tool.json` | 載らない。カードは README とソースへのリンク |

slug はフォルダ名です。`^[a-z0-9]+(-[a-z0-9]+)*$`。JSON に slug は書きません。

新しいものは手でコピーせず、リポジトリのルートで次を使ってください。

```bash
npm run new-demo -- <slug>                  # 静的 HTML。既定
npm run new-demo -- <slug> --template vite  # Vite + React + TypeScript
npm run new-tool -- <slug>
```

静的 HTML で足りるものに、フレームワークを被せないでください。Vite のデモは、そのフォルダに `package.json` と `package-lock.json` を持ち、`npm run build` が `dist/index.html` を出します。lock が無いデモは、サイトのビルドが失敗します。

`demo.json` / `tool.json` の項目は `title`、`description`、`tags`、`date`、`tech`、`status` だけです。`tech` にモデルやライブラリの名前を書きます。`status` は `ready` か `wip` です。一覧のカードは、この JSON から生成されます。ギャラリーの HTML を手で編集しないでください。

## 境界

- 作業は、足したフォルダの中だけにしてください。他の `demos/*` と `tools/*` のソース、依存、README の測定記録は変えないでください。
- `demos/pagoda-garden/index.html` は Grok 4.7 の一発出力です。バイト列を変えないでください。整形も、文言の修正も、ビルドへの取り込みも禁止です。
- ルートの `package.json` にデモの依存を足さないでください。依存はそのデモのフォルダだけです。npm workspaces にはしません。
- 公開パスは `/cursor-try/<slug>/` です。Vite の `base` はフォルダ名から `/cursor-try/<slug>/` になります。ドメイン直下の `/assets/...` は、ビルドが拒否します。
- 画面のリンクでトップへ戻るときは、公開 URL からの相対 `../` か `/cursor-try/` を使ってください。

## 数字

画面、共有カード、README、図、同梱 JSON のどこにも、作った数値を置かないでください。見本、台本、再生、サーバが無いときのダミー結果も同じです。まだ測っていない欄は「—」のままにします。

過去の README に書いてある秒数や件数は、そのとき測った記録です。消したり、別の実行の数字で置き換えたりしないでください。新しい測定を書くときは、いつ、どの環境で、何を測ったかをそのデモの README に足します。

## 終了前

`demos/js-wasm-bench` の `npm run build` は wasm-pack を呼びます。Pages のワークフローが Rust、`wasm32-unknown-unknown`、wasm-pack を先に入れます。wasm-opt は通しません。他のデモの依存には足しません。

リポジトリのルートで次が成功してから終えてください。

```bash
npm run build
```

一つのデモが失敗すると、コマンドは終了コード 1 で止まり、失敗した slug を出します。成功した隣のデモだけでは公開しません。

ブラウザで見るときは `npm run serve` のあと、http://127.0.0.1:4173/cursor-try/ と、各デモの http://127.0.0.1:4173/cursor-try/<slug>/ です。この形が Pages と同じです。

ツールを変えたときは、そのフォルダのテストを実行してください。同時リクエスト測定は `tools/llm-concurrency-bench/` で `python3 -m unittest tests/test_stats.py` です。サーバへ実際に撃った結果は、サーバが無い環境では作りません。

## ライセンス

YOLO の重みは AGPL-3.0 です。全文は `demos/yolo/public/models/LICENSE-AGPL-3.0.txt`、来歴は同じフォルダの `NOTICE.txt` です。サンプル画像の作者とライセンスは `demos/yolo/README.md` にあります。クレジットを削らないでください。

`coi-serviceworker.js` は MIT（Guido Zuidhof）です。同時リクエスト測定の Noto Sans JP は SIL Open Font License です。
