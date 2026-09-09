/** 3D print-bed view: every plate laid out on its printer bed, arranged in a grid. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Plate } from '@metrocad/core';
import type { DisplayPart } from './protocol.js';

export class PlatesView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root = new THREE.Group();
  private frame = 0;
  private bedCenters: THREE.Vector3[] = [];
  private bedSize = { x: 180, y: 180 };
  private gridCols = 1;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private raycaster = new THREE.Raycaster();
  private bedMeshes: THREE.Mesh[] = [];
  onSelect?: (index: number) => void;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0xe6e2db);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as any).environmentIntensity = 0.4;
    this.camera = new THREE.PerspectiveCamera(35, 1, 5, 30000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-600, 1500, 900);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.5;
    this.scene.add(key, new THREE.HemisphereLight(0xffffff, 0xa08a70, 0.35));
    this.keyLight = key;
    const table = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.9 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -8; table.receiveShadow = true;
    this.scene.add(table);
    this.scene.add(this.root);
    canvas.addEventListener('click', (e) => this.pick(e));
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }
  private keyLight: THREE.DirectionalLight;

  resize() {
    const r = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r?.width ?? 800)), h = Math.max(1, Math.floor(r?.height ?? 600));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  private animate = () => { this.frame = requestAnimationFrame(this.animate); this.controls.update(); this.renderer.render(this.scene, this.camera); };
  dispose() { cancelAnimationFrame(this.frame); }

  private material(color: string) {
    let m = this.materials.get(color);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.7, flatShading: true }); this.materials.set(color, m); }
    return m;
  }

  private bedTexture(x: number, y: number, label: string): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * y / x);
    const g = c.getContext('2d')!;
    g.fillStyle = '#2b2d31'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
    const step = c.width / (x / 10);
    for (let i = 0; i <= x / 10; i++) { g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, c.height); g.stroke(); }
    for (let j = 0; j <= y / 10; j++) { g.beginPath(); g.moveTo(0, j * step); g.lineTo(c.width, j * step); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = 'bold 22px -apple-system, Inter, sans-serif'; g.textBaseline = 'bottom';
    g.fillText(label, 12, c.height - 8);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  setPlates(plates: Plate[], parts: DisplayPart[], printerName: string) {
    this.root.clear(); this.bedMeshes = []; this.bedCenters = [];
    if (!plates.length) return;
    const bed = plates[0].bed; this.bedSize = bed;
    const cols = Math.ceil(Math.sqrt(plates.length * 1.4)); this.gridCols = cols;
    const gapX = bed.x + 40, gapY = bed.y + 40;
    const rows = Math.ceil(plates.length / cols);
    const partById = new Map(parts.map((p) => [p.id, p]));
    plates.forEach((plate, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const ox = (col - (cols - 1) / 2) * gapX, oz = (row - (rows - 1) / 2) * gapY;
      const g = new THREE.Group();
      // bed: box, top face at y=0; map plate x -> world x, plate y -> world -z
      const bedMesh = new THREE.Mesh(new THREE.BoxGeometry(bed.x, 6, bed.y), [
        new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ map: this.bedTexture(bed.x, bed.y, `${i + 1}  ${plate.name}  ·  ${printerName}`), roughness: 0.55 }),
        new THREE.MeshStandardMaterial({ color: 0x1f2124 }), new THREE.MeshStandardMaterial({ color: 0x1f2124 }), new THREE.MeshStandardMaterial({ color: 0x1f2124 }),
      ]);
      bedMesh.position.set(0, -3, 0); bedMesh.receiveShadow = true; bedMesh.userData.index = i;
      g.add(bedMesh); this.bedMeshes.push(bedMesh);
      // parts merged by colour
      const byColor = new Map<string, { pos: number[]; idx: number[] }>();
      for (const item of plate.items) {
        const list = parts.filter((p) => p.id === item.partId || (p.id.startsWith(item.partId + '-') && (p.kind === 'labelPlate' || p.kind === 'labelText')));
        const c = Math.cos((item.rotation * Math.PI) / 180), s = Math.sin((item.rotation * Math.PI) / 180);
        // group z-min so the item's bottom sits on the bed
        let minZ = Infinity; for (const p of list) minZ = Math.min(minZ, p.bbox.min[2]);
        for (const p of list) {
          const acc = byColor.get(p.color) ?? { pos: [], idx: [] }; byColor.set(p.color, acc);
          const base = acc.pos.length / 3;
          const P = p.mesh.positions;
          for (let k = 0; k < P.length; k += 3) {
            const x = P[k] * c - P[k + 1] * s + item.dx - bed.x / 2, y = P[k] * s + P[k + 1] * c + item.dy - bed.y / 2, z = P[k + 2] - minZ;
            acc.pos.push(x, z, -y);
          }
          for (let k = 0; k < p.mesh.indices.length; k++) acc.idx.push(p.mesh.indices[k] + base);
        }
      }
      for (const [color, acc] of byColor) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
        geo.setIndex(acc.idx);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, this.material(color)); mesh.castShadow = true; mesh.receiveShadow = true;
        g.add(mesh);
      }
      void partById;
      g.position.set(ox, 0, oz);
      this.root.add(g);
      this.bedCenters.push(new THREE.Vector3(ox, 0, oz));
    });
    const span = Math.max(cols * gapX, rows * gapY);
    this.keyLight.shadow.camera.left = -span; this.keyLight.shadow.camera.right = span; this.keyLight.shadow.camera.top = span; this.keyLight.shadow.camera.bottom = -span;
    this.keyLight.shadow.camera.far = 6000; this.keyLight.shadow.camera.updateProjectionMatrix();
    this.frameAll();
  }

  frameAll() {
    const cols = this.gridCols, n = this.bedCenters.length, rows = Math.ceil(n / cols);
    const w = cols * (this.bedSize.x + 40), d = rows * (this.bedSize.y + 40);
    const dist = Math.max(w / this.camera.aspect, d * 1.3) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) * 1.05;
    this.camera.position.set(dist * 0.25, dist * 0.75, dist * 0.7);
    this.controls.target.set(0, 0, 0); this.controls.update();
  }

  focus(i: number) {
    const c = this.bedCenters[i]; if (!c) return;
    const dist = Math.max(this.bedSize.x, this.bedSize.y) * 1.6;
    this.camera.position.set(c.x + dist * 0.35, dist * 0.8, c.z + dist * 0.75);
    this.controls.target.copy(c); this.controls.update();
  }

  private pick(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hit = this.raycaster.intersectObjects(this.bedMeshes, false)[0];
    if (hit) { const i = hit.object.userData.index; this.focus(i); this.onSelect?.(i); }
  }
}
