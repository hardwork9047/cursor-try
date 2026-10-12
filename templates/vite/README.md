# __TITLE__

`demos/__SLUG__/` の Vite デモです。公開パスは `/cursor-try/__SLUG__/` です。`vite.config.ts` の base はフォルダ名から決まります。

依存はこのフォルダの `package.json` だけに足してください。`package-lock.json` をコミットします。

`demo.json` の title、description、tags、tech を書き換え、公開できる状態になったら `status` を `ready` にします。画面とこの README には、測っていない数値を書かないでください。

```bash
cd demos/__SLUG__
npm ci
npm run dev
```

開発サーバは http://127.0.0.1:5173/cursor-try/__SLUG__/ です。サイト全体は、リポジトリのルートで `npm run build` してから `npm run serve` です。
