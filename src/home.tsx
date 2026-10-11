import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SiteBar } from "./SiteBar";
import { SITE_URL } from "./config";
import "./fonts.css";
import "./styles.css";

const BASE = import.meta.env.BASE_URL;

function Home() {
  return (
    <div className="app home">
      <SiteBar current="home" />
      <header className="mast">
        <div>
          <p className="kicker">GENBA · 端末の中で測る</p>
          <h1>現場のブラウザ</h1>
          <p className="lede">
            サーバに送らない。文章の速度と、画像の検出を、開いたブラウザだけで測る。
          </p>
        </div>
      </header>
      <main className="home-wrap">
        <div className="entries">
          <a className="entry" href={`${BASE}llm/`}>
            <span className="en">LOCAL LLM</span>
            <strong>ブラウザ内ローカルLLMベンチ</strong>
            <p>
              小さなオープンLLMを WebGPU で動かし、立ち上げ・段取り時間・スループットを測る。
            </p>
            <span className="go">測定画面へ</span>
          </a>
          <a className="entry" href={`${BASE}yolo/`}>
            <span className="en">YOLO26 · 2026-01-14</span>
            <strong>YOLO26 ブラウザ検出</strong>
            <p>
              最新の YOLO26 をカメラ・画像・動画にかける。箱、本数、処理時間は、その場の推論だけ。
            </p>
            <span className="go">検出画面へ</span>
          </a>
        </div>
        <p className="home-note">
          どちらの画面も、まだ測っていない欄は「—」です。見本の数値や再生用の結果は入れていません。
        </p>
      </main>
      <footer className="foot">
        <span>数字は、開いたブラウザが測ったものだけです。</span>
        <a href={SITE_URL}>{SITE_URL.replace("https://", "")}</a>
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("root が見つかりません");

createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
