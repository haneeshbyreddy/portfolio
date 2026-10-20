import {
  Box3,
  CanvasTexture,
  Color,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
  Vector3,
} from 'three';
import { mulberry32 } from '../core/math';
import { createScreenMaterial } from '../screens/ScreenMaterial';
import { shared } from '../world/shared';
import { buildStations, lawnBounds, FOOTPRINT, type Station } from './layout';
import { createOfficeMaterial, mat } from './builder';
import { Sheets } from './Sheets';
import {
  buildBooksGeometry,
  buildChairGeometry,
  buildDeskBaseGeometry,
  buildMugGeometry,
  buildPapersGeometry,
  buildPlantGeometry,
  buildScreenGeometry,
  buildStationGeometry,
  LED,
  ledGeometry,
  MUG,
  SCREEN,
} from './parts';

export interface Desk extends Station {
  index: number;
  occupied: boolean;
  /** Vacant desks wait under a dust sheet. */
  covered: boolean;
  screen: Mesh;
  screenMaterial: ReturnType<typeof createScreenMaterial>;
  hitBox: Box3;
  /** World-space anchor for the hover label. */
  labelAnchor: Vector3;
  screenCenter: Vector3;
  /** Chair pose in station space (driven by the worker). */
  chair: { x: number; z: number; yaw: number };
  /** Mug override: when set, the mug follows a hand (world matrix). */
  mugOverride: Matrix4 | null;
  hasMug: boolean;
}

const _m = new Matrix4();
const _m2 = new Matrix4();

export class Office {
  readonly root = new Object3D();
  readonly desks: Desk[] = [];
  readonly material = createOfficeMaterial();
  readonly sheets: Sheets;

  private stations: InstancedMesh;
  private bases: InstancedMesh;
  /** Covered desks whose sheet is (partly) off. */
  private exposed = new Set<number>();
  private chairs: InstancedMesh;
  private mugs: InstancedMesh;
  private leds: InstancedMesh;
  private mugIndex = new Map<number, number>();

  /** `handsets`: desks whose worker keeps a phone in a stand where the mug would be. */
  constructor(scene: Scene, occupied: Set<number>, shadows: boolean, handsets = new Set<number>()) {
    this.root.name = 'office';
    scene.add(this.root);

    const stations = buildStations();
    const rand = mulberry32(42);
    const N = stations.length;

    // --- desks: full stations where someone works, bare legs under each sheet
    this.stations = new InstancedMesh(buildStationGeometry(), this.material, N);
    this.bases = new InstancedMesh(buildDeskBaseGeometry(), this.material, N);
    for (const m of [this.stations, this.bases]) {
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      m.frustumCulled = false;
      this.root.add(m);
    }

    // --- chairs (dynamic: workers swivel them)
    this.chairs = new InstancedMesh(buildChairGeometry(), this.material, N);
    this.chairs.castShadow = shadows;
    this.chairs.receiveShadow = shadows;
    this.chairs.frustumCulled = false;
    this.root.add(this.chairs);

    // --- screens
    const screenGeo = buildScreenGeometry();
    const ledMat = new MeshBasicMaterial({ toneMapped: false });
    this.leds = new InstancedMesh(ledGeometry(), ledMat, N);
    this.leds.frustumCulled = false;
    this.root.add(this.leds);

    // --- props
    const mugColors = ['#f4f1ea', '#e9e4d8', '#8fae9a', '#c86a43', '#2f3a35', '#f4f1ea'];
    const mugCount = N;
    this.mugs = new InstancedMesh(buildMugGeometry(), this.material, mugCount);
    this.mugs.castShadow = shadows;
    this.mugs.frustumCulled = false;
    this.root.add(this.mugs);

    const plants: Matrix4[] = [];
    const papers: Matrix4[] = [];
    const books: Matrix4[] = [];

    stations.forEach((s, i) => {
      const isOccupied = occupied.has(i);
      const material = createScreenMaterial();
      const screen = new Mesh(screenGeo, material);
      screen.matrixAutoUpdate = false;
      screen.matrix.copy(s.matrix);
      screen.name = `screen-${i}`;
      this.root.add(screen);

      const hitBox = new Box3();
      const f = FOOTPRINT;
      for (const [x, y, z] of [[f.x0, 0, f.z0], [f.x1, 0, f.z0], [f.x0, 1.4, f.z1], [f.x1, 1.4, f.z1]]) {
        hitBox.expandByPoint(new Vector3(x, y, z).applyMatrix4(s.matrix));
      }

      const desk: Desk = {
        ...s,
        index: i,
        occupied: isOccupied,
        covered: !isOccupied,
        screen,
        screenMaterial: material,
        hitBox,
        labelAnchor: new Vector3(0.1, 1.62, 0.55).applyMatrix4(s.matrix),
        screenCenter: new Vector3(SCREEN.center.x, SCREEN.center.y, SCREEN.center.z).applyMatrix4(s.matrix),
        // an empty chair sits pulled back, clear of the sheet's hem
        chair: isOccupied
          ? { x: 0, z: 0, yaw: 0 }
          : { x: (rand() - 0.5) * 0.1, z: -0.13 - rand() * 0.07, yaw: (rand() - 0.5) * 0.4 },
        mugOverride: null,
        hasMug: isOccupied && !handsets.has(i),
      };
      this.desks.push(desk);

      // LED: green when someone is working, amber standby otherwise
      this.leds.setMatrixAt(i, _m.copy(s.matrix).multiply(_m2.makeTranslation(LED.x, LED.y, LED.z)));
      this.leds.setColorAt(i, new Color(isOccupied ? '#5dff9b' : '#ffb347').multiplyScalar(isOccupied ? 1.6 : 0.7));

      if (desk.covered) return; // nothing on a desk under a sheet
      if (desk.hasMug) {
        const mi = this.mugIndex.size;
        this.mugIndex.set(i, mi);
        this.mugs.setColorAt(mi, new Color(mugColors[Math.floor(rand() * mugColors.length)]));
      }
      if (rand() < 0.75 && !handsets.has(i)) {
        papers.push(s.matrix.clone().multiply(mat(0.56 - rand() * 0.04, 0.74, 0.74 + rand() * 0.05, 0, (rand() - 0.5) * 0.4, 0)));
      }
      if (rand() < 0.35) plants.push(s.matrix.clone().multiply(mat(0.72, 0.74, 0.92, 0, rand() * 6, 0)));
      if (rand() < 0.5) books.push(s.matrix.clone().multiply(mat(-0.45, 0.74, 0.9, 0, (rand() - 0.5) * 0.5, 0)));
    });
    this.mugs.count = this.mugIndex.size;
    if (this.mugs.instanceColor) this.mugs.instanceColor.needsUpdate = true;
    if (this.leds.instanceColor) this.leds.instanceColor.needsUpdate = true;
    this.leds.instanceMatrix.needsUpdate = true;

    const addStatic = (geo: ReturnType<typeof buildPlantGeometry>, list: Matrix4[], name: string) => {
      if (!list.length) return;
      const m = new InstancedMesh(geo, this.material, list.length);
      list.forEach((mm, i) => m.setMatrixAt(i, mm));
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      m.computeBoundingSphere();
      m.name = name;
      this.root.add(m);
    };
    addStatic(buildPlantGeometry(), plants, 'plants');
    addStatic(buildPapersGeometry(), papers, 'papers');
    addStatic(buildBooksGeometry(), books, 'books');

    this.sheets = new Sheets(this.root, this.desks.filter((d) => d.covered), shadows);
    this.sheets.onExpose = (desk, exposed) => {
      if (exposed) this.exposed.add(desk.index);
      else this.exposed.delete(desk.index);
      this.refreshFurniture();
    };
    this.refreshFurniture();
    this.bakeContactShadows();
    this.update();
  }

  /** Full stations for open desks, bare legs (and dark screens) under sheets. */
  private refreshFurniture() {
    let full = 0, bare = 0;
    for (const d of this.desks) {
      const open = !d.covered || this.exposed.has(d.index);
      if (open) this.stations.setMatrixAt(full++, d.matrix);
      else this.bases.setMatrixAt(bare++, d.matrix);
      d.screen.visible = open;
    }
    this.stations.count = full;
    this.bases.count = bare;
    this.stations.instanceMatrix.needsUpdate = true;
    this.bases.instanceMatrix.needsUpdate = true;
  }

  /** Soft overcast contact shadows painted under the furniture, read by grass + ground. */
  private bakeContactShadows() {
    const b = lawnBounds(6);
    const S = 48; // px per metre
    const W = Math.ceil((b.x1 - b.x0) * S);
    const H = Math.ceil((b.z1 - b.z0) * S);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    const shape = (blur: number, alpha: number, draw: () => void) => {
      ctx.save();
      ctx.shadowColor = `rgba(0,0,0,${alpha})`;
      ctx.shadowBlur = blur;
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.6})`;
      draw();
      ctx.restore();
    };

    // desks + chairs
    for (const d of this.desks) {
      const e = d.matrix.elements;
      // station (x, z) → canvas: X = a x + c z + e, Y = b x + d z + f
      ctx.setTransform(S * e[0], S * e[2], S * e[8], S * e[10], (e[12] - b.x0) * S, (e[14] - b.z0) * S);
      shape(22, 0.5, () => ctx.fillRect(-0.62, 0.32, 1.5, 0.75));
      shape(12, 0.55, () => ctx.fillRect(0.47, 0.36, 0.42, 0.68));
      // a sheet's skirt keeps the light off a wider patch of lawn
      if (d.covered) shape(34, 0.32, () => ctx.fillRect(-0.86, 0.12, 1.98, 1.16));
      const cx = d.chair.x, cz = d.chair.z;
      shape(16, 0.45, () => {
        ctx.beginPath();
        ctx.arc(cx, cz, 0.3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const tex = new CanvasTexture(canvas);
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    shared.uAO.value = tex;
    shared.uAOBounds.value.set(b.x0, b.z0, b.x1, b.z1);
  }

  /** Push chair + mug transforms after workers have moved. */
  update() {
    for (const d of this.desks) {
      _m.copy(d.matrix).multiply(mat(d.chair.x, 0, d.chair.z, 0, d.chair.yaw, 0));
      this.chairs.setMatrixAt(d.index, _m);
      const mi = this.mugIndex.get(d.index);
      if (mi !== undefined) {
        if (d.mugOverride) this.mugs.setMatrixAt(mi, d.mugOverride);
        else this.mugs.setMatrixAt(mi, _m.copy(d.matrix).multiply(_m2.makeTranslation(MUG.x, MUG.y, MUG.z)));
      }
    }
    this.chairs.instanceMatrix.needsUpdate = true;
    this.mugs.instanceMatrix.needsUpdate = true;
  }
}
