import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { DepthRun, Photo } from "./types";

const VIEW_HEIGHT = 420;

export function PointView({ photo, run }: { photo: Photo | null; run: DepthRun | null }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!photo || !run || !el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const width = el.clientWidth || 640;
    renderer.setSize(width, VIEW_HEIGHT);
    renderer.setClearColor(0x12110e);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / VIEW_HEIGHT, 0.01, 20);
    camera.position.set(0, 0.12, 1.7);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0.25);

    const stride = Math.max(1, Math.ceil(Math.sqrt((run.width * run.height) / 80000)));
    const positions: number[] = [];
    const colors: number[] = [];
    for (let y = 0; y < run.height; y += stride) {
      for (let x = 0; x < run.width; x += stride) {
        const i = y * run.width + x;
        positions.push(x / run.width - 0.5, 0.5 - y / run.height, run.relative[i] * 0.55);
        const o = i * 4;
        colors.push(photo.pixels[o] / 255, photo.pixels[o + 1] / 255, photo.pixels[o + 2] / 255);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 0.014, vertexColors: true, sizeAttenuation: true });
    scene.add(new THREE.Points(geometry, material));

    let frame = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      const next = el.clientWidth || 1;
      camera.aspect = next / VIEW_HEIGHT;
      camera.updateProjectionMatrix();
      renderer.setSize(next, VIEW_HEIGHT);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [photo, run]);

  if (!photo || !run) {
    return <p className="empty-view">推定が終わると、ここに相対的な点群が出ます。</p>;
  }
  return <div className="point-host" ref={host} />;
}
