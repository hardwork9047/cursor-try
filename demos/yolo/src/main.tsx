import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { YoloApp } from "./App";
import "./fonts.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("root が見つかりません");

createRoot(root).render(
  <StrictMode>
    <YoloApp />
  </StrictMode>,
);
