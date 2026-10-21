import {
  Box3,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
  Vector3,
} from 'three';
import { mulberry32 } from '../core/math';
import { createScreenMaterial } from '../screens/ScreenMaterial';
import type { GroundMarks } from '../camp/Ground';
import { buildStations, FOOTPRINT, type Station } from './layout';
import { createOfficeMaterial, mat } from './builder';
import {
  buildBooksGeometry,
  buildChairGeometry,
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

  private stations: InstancedMesh;
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

    // --- desks
    this.stations = new InstancedMesh(buildStationGeometry(), this.material, N);
    this.stations.castShadow = shadows;
    this.stations.receiveShadow = shadows;
    this.stations.frustumCulled = false;
    this.root.add(this.stations);

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
        screen,
        screenMaterial: material,
        hitBox,
        labelAnchor: new Vector3(0.1, 1.62, 0.55).applyMatrix4(s.matrix),
        screenCenter: new Vector3(SCREEN.center.x, SCREEN.center.y, SCREEN.center.z).applyMatrix4(s.matrix),
        // an empty chair sits pulled back from the desk, a little askew
        chair: isOccupied
          ? { x: 0, z: 0, yaw: 0 }
          : { x: (rand() - 0.5) * 0.1, z: -0.13 - rand() * 0.07, yaw: (rand() - 0.5) * 0.4 },
        mugOverride: null,
        hasMug: isOccupied && !handsets.has(i),
      };
      this.desks.push(desk);
      this.stations.setMatrixAt(i, s.matrix);

      // LED: green when someone is working, amber standby otherwise
      this.leds.setMatrixAt(i, _m.copy(s.matrix).multiply(_m2.makeTranslation(LED.x, LED.y, LED.z)));
      this.leds.setColorAt(i, new Color(isOccupied ? '#5dff9b' : '#ffb347').multiplyScalar(isOccupied ? 1.6 : 0.7));

      if (!isOccupied) return; // a vacant desk is bare
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
    this.stations.instanceMatrix.needsUpdate = true;

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

    this.update();
  }

  /**
   * What the desks leave on the ground: soft shade under the desk and chair,
   * and grass flattened where someone has sat all day and pushed their chair
   * back. Around an empty desk it's barely touched: it was only carried in.
   */
  mark(marks: GroundMarks) {
    for (const d of this.desks) {
      const cx = d.chair.x, cz = d.chair.z;
      marks
        .shadow(d.matrix, 0.5, 0.45, (ctx) => ctx.fillRect(-0.62, 0.32, 1.5, 0.75))
        .shadow(d.matrix, 0.55, 0.25, (ctx) => ctx.fillRect(0.47, 0.36, 0.42, 0.68))
        .shadow(d.matrix, 0.45, 0.32, (ctx) => {
          ctx.beginPath();
          ctx.arc(cx, cz, 0.3, 0, Math.PI * 2);
          ctx.fill();
        });
      // the drawer pedestal and the end panel stand flat on the ground
      marks
        .cover(d.matrix, (ctx) => ctx.fillRect(0.47, 0.36, 0.4, 0.68))
        .cover(d.matrix, (ctx) => ctx.fillRect(-0.62, 0.36, 0.04, 0.68));
      if (d.occupied) {
        marks
          .tread(d.matrix, 0.95, 0.35, (ctx) => {
            ctx.beginPath();
            ctx.ellipse(0, -0.12, 0.62, 0.72, 0, 0, Math.PI * 2);
            ctx.fill();
          })
          .tread(d.matrix, 0.55, 0.45, (ctx) => ctx.fillRect(-0.55, 0.2, 1.4, 0.95));
      } else {
        marks.tread(d.matrix, 0.3, 0.5, (ctx) => ctx.fillRect(-0.6, -0.2, 1.5, 1.3));
      }
    }
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
