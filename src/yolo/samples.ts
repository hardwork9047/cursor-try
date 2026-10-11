export const SAMPLES = [
  {
    id: "dog",
    file: "samples/dog.jpg",
    label: "犬（海岸）",
    author: "W.carter",
    page: "https://commons.wikimedia.org/wiki/File:Dog_at_N%C3%B8rre_Vorup%C3%B8r_Strand.jpg",
  },
  {
    id: "bicycle",
    file: "samples/bicycle.jpg",
    label: "人と自転車",
    author: "Wilfredor",
    page: "https://commons.wikimedia.org/wiki/File:Man_riding_a_bicycle_in_a_snowstorm_in_Quebec_city,_Quebec,_Canada.jpg",
  },
  {
    id: "bus",
    file: "samples/bus.jpg",
    label: "バスとバイク",
    author: "Jonywikis",
    page: "https://commons.wikimedia.org/wiki/File:Bus_and_motorcycle_on_a_road_in_Lagos.jpg",
  },
  {
    id: "apples",
    file: "samples/apples.jpg",
    label: "りんご",
    author: "Nutrition, Food Safety & Health",
    page: "https://commons.wikimedia.org/wiki/File:Washed_apples_on_kitchen_towel_drying.jpg",
  },
] as const;

export type Sample = (typeof SAMPLES)[number];

export const YOLO_MODELS = [
  {
    id: "yolo26n",
    label: "nano",
    file: "models/yolo26n.onnx",
    note: "既定・軽い",
  },
  {
    id: "yolo26s",
    label: "small",
    file: "models/yolo26s.onnx",
    note: "精度寄り",
  },
] as const;

export type YoloModel = (typeof YOLO_MODELS)[number];

export function assetUrl(file: string): string {
  return new URL(`${import.meta.env.BASE_URL}${file}`, window.location.origin).href;
}
