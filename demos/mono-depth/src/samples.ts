export const SAMPLES = [
  {
    id: "forklift",
    file: "samples/forklift.jpg",
    label: "フォークリフト",
    author: "Onjacktallcuca",
    license: "パブリックドメイン",
    page: "https://commons.wikimedia.org/wiki/File:Forklift_truck_empilhadeira.JPG",
  },
  {
    id: "boxes",
    file: "samples/boxes.jpg",
    label: "段ボールの山",
    author: "Federal Bureau of Investigation",
    license: "パブリックドメイン",
    page: "https://commons.wikimedia.org/wiki/File:EFTA00002251_-_White_door_with_a_window_and_handle_stands_in_a_warehouse_next_to_stacked_cardboard_boxes_on_a_pallet.jpg",
  },
  {
    id: "pallets",
    file: "samples/pallets.jpg",
    label: "物資のパレット",
    author: "Jacinta Quesada / FEMA",
    license: "パブリックドメイン",
    page: "https://commons.wikimedia.org/wiki/File:Pallets_for_Gustav.jpg",
  },
] as const;

export type Sample = (typeof SAMPLES)[number];
