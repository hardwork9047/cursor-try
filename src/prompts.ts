import type { BenchPrompt } from "./types";

export const FIXED_PROMPTS: BenchPrompt[] = [
  {
    id: "setup",
    title: "内段取りと外段取り",
    text: "射出成形の金型交換で、内段取りと外段取りの違いを2文で説明して。",
  },
  {
    id: "takt",
    title: "タクトから出来高",
    text: "タクトタイム12秒、稼働率85%のとき、1時間の出来高を計算し、式も示して。",
  },
  {
    id: "stop",
    title: "突発停止の切り分け",
    text: "設備が突然停止した。一次切り分けの確認項目を3つ、箇条書きで。",
  },
];

export function activePrompts(custom: string): BenchPrompt[] {
  const text = custom.trim();
  if (!text) return FIXED_PROMPTS;
  return [
    ...FIXED_PROMPTS,
    {
      id: "custom",
      title: "任意作業",
      text: text.slice(0, 800),
    },
  ];
}
