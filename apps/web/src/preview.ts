/** three.js wall preview of the assembled map. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DisplayPart } from './protocol.js';

export class Preview {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mapGroup = new THREE.Group();
  wall!: THREE.Mesh;
  floor!: THREE.Mesh;
  private frame = 0;
  private size = { w: 900, h: 600 };
  private materials = new Map<string, THREE.MeshStandardMaterial>();

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.camera = new THREE.PerspectiveCamera(38, 1, 10, 20000);
    this.camera.position.set(0, 0, 1700);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.minDistance = 120;
    this.controls.maxDistance = 6000;
    this.scene.background = new THREE.Color(0xe9e6e0);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as any).environmentIntensity = 0.18;

    // Room
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1eee8, roughness: 0.95, metalness: 0 });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000), wallMat);
    this.wall.receiveShadow = true;
    this.scene.add(this.wall);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xb9a68d, roughness: 0.8 });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 4000), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, -1400, 2000);
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8d7b68, 0.35);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
    key.position.set(-900, 1400, 1600);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1200; key.shadow.camera.right = 1200; key.shadow.camera.top = 1200; key.shadow.camera.bottom = -1200;
    key.shadow.camera.near = 200; key.shadow.camera.far = 5000;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.6;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
    fill.position.set(1200, 400, 1000);
    this.scene.add(fill);

    this.scene.add(this.mapGroup);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }

  resize() {
    const r = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r?.width ?? 800)), h = Math.max(1, Math.floor(r?.height ?? 600));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() { cancelAnimationFrame(this.frame); }

  material(color: string): THREE.MeshStandardMaterial {
    let m = this.materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.7, metalness: 0.0, flatShading: true });
      this.materials.set(color, m);
    }
    return m;
  }

  /** Replace the map with the given parts (assembled coordinates, mm). */
  setParts(parts: DisplayPart[], width: number, height: number) {
    this.mapGroup.clear();
    this.size = { w: width, h: height };
    // Merge geometry by colour for draw-call efficiency.
    const byColor = new Map<string, DisplayPart[]>();
    for (const p of parts) { const l = byColor.get(p.color) ?? []; l.push(p); byColor.set(p.color, l); }
    for (const [color, list] of byColor) {
      let nv = 0, ni = 0;
      for (const p of list) { nv += p.mesh.positions.length; ni += p.mesh.indices.length; }
      const pos = new Float32Array(nv), idx = new Uint32Array(ni);
      let vo = 0, io = 0;
      for (const p of list) {
        pos.set(p.mesh.positions, vo);
        const base = vo / 3;
        for (let i = 0; i < p.mesh.indices.length; i++) idx[io + i] = p.mesh.indices[i] + base;
        vo += p.mesh.positions.length; io += p.mesh.indices.length;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, this.material(color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = list[0].colorName;
      this.mapGroup.add(mesh);
    }
    // Centre the map on the wall, hang at eye height.
    this.mapGroup.position.set(-width / 2, -height / 2, 0.5);
    this.frameMap();
  }

  private fitDistance() {
    const { w, h } = this.size;
    return Math.max(w / this.camera.aspect, h) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) * 1.12;
  }

  /** Camera presets: 'front', 'angle' (oblique, shows the relief), 'closeup'. */
  view(preset: 'front' | 'angle' | 'closeup' = 'angle') {
    const { w, h } = this.size;
    const d = this.fitDistance();
    if (preset === 'front') { this.camera.position.set(0, 0, d); this.controls.target.set(0, 0, 0); }
    else if (preset === 'angle') { this.camera.position.set(-d * 0.58, -d * 0.22, d * 0.8); this.controls.target.set(0, 0, 0); }
    else { const cx = w * 0.05, cy = h * 0.02; this.camera.position.set(cx - 150, cy - 120, 200); this.controls.target.set(cx, cy, 0); }
    this.controls.update();
  }

  frameMap() { this.view('angle'); }

  /** Render a screenshot at the current view. */
  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }
}
