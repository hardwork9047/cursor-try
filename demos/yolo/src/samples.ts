export type VisionMode = "coco" | "warehouse";

export const SAMPLES = [
  {
    id: "dog",
    file: "samples/dog.jpg",
    label: "犬（海岸）",
    author: "W.carter",
    license: "CC0",
    page: "https://commons.wikimedia.org/wiki/File:Dog_at_N%C3%B8rre_Vorup%C3%B8r_Strand.jpg",
  },
  {
    id: "bicycle",
    file: "samples/bicycle.jpg",
    label: "人と自転車",
    author: "Wilfredor",
    license: "CC0",
    page: "https://commons.wikimedia.org/wiki/File:Man_riding_a_bicycle_in_a_snowstorm_in_Quebec_city,_Quebec,_Canada.jpg",
  },
  {
    id: "bus",
    file: "samples/bus.jpg",
    label: "バスとバイク",
    author: "Jonywikis",
    license: "CC0",
    page: "https://commons.wikimedia.org/wiki/File:Bus_and_motorcycle_on_a_road_in_Lagos.jpg",
  },
  {
    id: "apples",
    file: "samples/apples.jpg",
    label: "りんご",
    author: "Nutrition, Food Safety & Health",
    license: "CC0",
    page: "https://commons.wikimedia.org/wiki/File:Washed_apples_on_kitchen_towel_drying.jpg",
  },
] as const;

export const WAREHOUSE_SAMPLES = [
  {
    id: "wh-forklift",
    file: "samples/wh-forklift.jpg",
    label: "フォークリフト",
    author: "Onjacktallcuca",
    license: "パブリックドメイン",
    page: "https://commons.wikimedia.org/wiki/File:Forklift_truck_empilhadeira.JPG",
  },
  {
    id: "wh-small",
    file: "samples/wh-small.jpg",
    label: "小型機と人",
    author: "Marketing Team",
    license: "パブリックドメイン",
    page: "https://commons.wikimedia.org/wiki/File:Forklift.JPG",
  },
  {
    id: "wh-boxes",
    file: "samples/wh-boxes.jpg",
    label: "段ボールの山",
    author: "Federal Bureau of Investigation",
    license: "パブリックドメイン",
    page: "https://commons.wikimedia.org/wiki/File:EFTA00002251_-_White_door_with_a_window_and_handle_stands_in_a_warehouse_next_to_stacked_cardboard_boxes_on_a_pallet.jpg",
  },
  {
    id: "wh-park",
    file: "samples/wh-park.jpg",
    label: "人と機体",
    author: "GlacierNPS",
    license: "パブリックドメイン",
    page: "https://commons.wikimedia.org/wiki/File:Lifting_Park_Supplies_with_Forklift_(51966479517).jpg",
  },
  {
    id: "wh-pallets",
    file: "samples/wh-pallets.jpg",
    label: "物資のパレット",
    author: "Jacinta Quesada / FEMA",
    license: "パブリックドメイン",
    page: "https://commons.wikimedia.org/wiki/File:Pallets_for_Gustav.jpg",
  },
] as const;

export type Sample = (typeof SAMPLES)[number] | (typeof WAREHOUSE_SAMPLES)[number];

export const YOLO_MODELS = [
  {
    id: "yolo26n",
    label: "nano",
    file: "models/yolo26n.onnx",
    note: "既定・軽い",
    mark: "26n",
  },
  {
    id: "yolo26s",
    label: "small",
    file: "models/yolo26s.onnx",
    note: "精度寄り",
    mark: "26s",
  },
] as const;

export const WAREHOUSE_MODELS = [
  {
    id: "yoloe26n",
    label: "nano",
    file: "models/yoloe-26n.onnx",
    note: "既定・軽い",
    mark: "E26n",
  },
  {
    id: "yoloe26s",
    label: "small",
    file: "models/yoloe-26s.onnx",
    note: "精度寄り",
    mark: "E26s",
  },
] as const;

export type YoloModel = (typeof YOLO_MODELS)[number] | (typeof WAREHOUSE_MODELS)[number];

export function modelsFor(mode: VisionMode) {
  return mode === "warehouse" ? WAREHOUSE_MODELS : YOLO_MODELS;
}

export function samplesFor(mode: VisionMode) {
  return mode === "warehouse" ? WAREHOUSE_SAMPLES : SAMPLES;
}

export function assetUrl(file: string): string {
  return new URL(`${import.meta.env.BASE_URL}${file}`, window.location.origin).href;
}
