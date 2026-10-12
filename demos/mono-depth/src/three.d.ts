declare module "three" {
  export class Object3D {}
  export class Camera {}
  export class Scene {
    add(object: Object3D): void;
  }
  export class PerspectiveCamera extends Camera {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    position: { set(x: number, y: number, z: number): void };
    updateProjectionMatrix(): void;
  }
  export class WebGLRenderer {
    constructor(options?: { antialias?: boolean });
    domElement: HTMLCanvasElement;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number): void;
    setClearColor(color: number): void;
    render(scene: Scene, camera: Camera): void;
    dispose(): void;
  }
  export class BufferAttribute {}
  export class Float32BufferAttribute extends BufferAttribute {
    constructor(array: number[], itemSize: number);
  }
  export class BufferGeometry {
    setAttribute(name: string, attribute: BufferAttribute): void;
    dispose(): void;
  }
  export class PointsMaterial {
    constructor(params?: { size?: number; vertexColors?: boolean; sizeAttenuation?: boolean });
    dispose(): void;
  }
  export class Points extends Object3D {
    constructor(geometry: BufferGeometry, material: PointsMaterial);
  }
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  import { Camera } from "three";
  export class OrbitControls {
    constructor(camera: Camera, domElement?: HTMLElement);
    enableDamping: boolean;
    target: { set(x: number, y: number, z: number): void };
    update(): void;
    dispose(): void;
  }
}
