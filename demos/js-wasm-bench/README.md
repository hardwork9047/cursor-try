# JavaScript と Rust の速度

同じ仕事を、素の JavaScript と Rust（WebAssembly）にやらせ、開いたブラウザの中で時間を比べます。Rust のコードは WebAssembly にコンパイルして、ブラウザの中で動かします。処理は Web Worker の中です。画面の数字は、その実行で測ったものだけです。見本の時間や、前の実行の再生はありません。まだ測っていない欄は「—」です。

公開パスは [/cursor-try/js-wasm-bench/](https://hardwork9047.github.io/cursor-try/js-wasm-bench/) です。

## 仕事

三つとも、手順と入力は両方で同じです。出力が一致したときだけ「✓ 一致」を出します。

1. **外観検査の画像処理**。輝度（`(77R + 150G + 29B) >> 8`）、3×3 の平均（範囲外は数に入れず、整数除算）、大津の二値化、4 連結のラベリング。面積 48 画素以上の連結成分を数えます。写真は下の CC0 画像で、長辺が 480 px を超えるときはブラウザの `drawImage` で縮めた画素を、両方に渡します。縮小は測定の外です。
2. **ラインのシミュレーション**。20 万個の仕事が 4 工程を、追い越しなしで通ります。到着間隔は `1 + (乱数 % 8)`、処理時間は `1 + (乱数 % 32)`。時刻は整数です。乱数は測定の前に一度だけ作り、毎回その配列を複製してから流します。
3. **センサ列の整列と集計**。同じ乱数で作った 1,048,576 個の 32 bit 値を、同じクイックソート（中央の値を枢軸、明示的なスタック）で並べます。中央の位置は `n/2`、95% 点は `95×(n−1)/100` の切り捨てです。合計と、2³¹ 以上の個数も比べます。

乱数は 64 bit の LCG（乗数 `6364136223846793005`、種 `0x4a756e7461000001`）です。

## 測り方

ウォームアップ 1 回は捨てます。続く 5 回の中央値と、最小・最大を出します。0 始まりの偶数回は JavaScript を先に、奇数回は Rust（WebAssembly）を先に測ります。

- **計算だけ**。作業バッファへ入れたあとの処理です。
- **コピー込み**。入力を作業バッファへ複製し、計算し、結果を読み戻すまでです。Rust（WebAssembly）では、線形メモリの確保とコピーが複製に入ります。

表の下の文は、二つの中央値の比から作ります。Rust の方が短いときは「Rustは JavaScript の N 倍速い」、JavaScript の方が短いときはその逆です。まだ測っていないときは「—」です。N は、その実行の比だけです。

論理コア数は `navigator.hardwareConcurrency`、ブラウザ名は `navigator.userAgent` です。共有カードの PNG は、測定が終わったあとだけ作ります。

Rust（WebAssembly）は release（`opt-level = 3`、LTO）です。wasm-pack の wasm-opt は使いません。binaryen 108 は複数テーブルの export を入れ替え、externref の初期化が失敗するためです。

## 写真

| ファイル | 作者 | ライセンス | ページ |
| --- | --- | --- | --- |
| `public/apples.jpg` | Nutrition, Food Safety & Health | CC0 | [Commons](https://commons.wikimedia.org/wiki/File:Washed_apples_on_kitchen_towel_drying.jpg) |

## ビルド

このデモだけの依存です。Rust 1.83.0（Pages が入れる版）、`wasm32-unknown-unknown`、wasm-pack が要ります。

```bash
rustup target add wasm32-unknown-unknown
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
cd demos/js-wasm-bench
npm ci
npm run dev       # http://127.0.0.1:5175/cursor-try/js-wasm-bench/
npm run build
```

`npm run build` は先に `wasm-pack build wasm --target web --release` を走らせ、生成物を `src/wasm/` に出します。この生成物はコミットしません。サイト全体は、リポジトリのルートで `npm run build` です。Rust が無いと、このデモのところで止まり、他のデモは公開されません。

Pages のワークフローは、全デモのビルドの前に Rust、wasm32 ターゲット、wasm-pack を入れます。呼ぶのはこのデモだけです。
