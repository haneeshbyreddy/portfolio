import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  CircleGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Quality } from '../core/quality';
import { createSky } from './Sky';
import { createTerrain } from './Terrain';
import { createGrass } from './Grass';
import { createTrees } from './Trees';
import { createAtmosphere } from './Atmosphere';
import { col, palette } from './palette';
import { shared } from './shared';

/** Light comes from behind the cloud deck, up and to the left of the hills. */
export const SUN_DIR = new Vector3(-0.45, 0.62, -0.62).normalize();

export function createWorld(scene: Scene, renderer: WebGLRenderer, quality: Quality) {
  scene.background = col(palette.fog);
  scene.fog = new FogExp2(col(palette.fog).getHex(), 0.0014);

  const sky = createSky(SUN_DIR);
  scene.add(sky.mesh);

  const terrain = createTerrain();
  scene.add(terrain.mesh);

  const grass = createGrass({ meadowCount: quality.meadowBlades, campCount: quality.campBlades });
  scene.add(grass.meadow, grass.camp);

  const trees = createTrees(quality.trees);

  const atmosphere = createAtmosphere(quality.tier === 'low' ? 160 : 420);
  atmosphere.setPixelRatio(quality.dpr);
  scene.add(atmosphere.pollen, atmosphere.birds);
  trees.meshes.forEach((m) => scene.add(m));

  // --- light: soft overcast. Image-based light from the sky does most of the work.
  const hemi = new HemisphereLight(new Color('#d6dee0'), new Color('#4d5a3a'), 0.55);
  scene.add(hemi);

  const sun = new DirectionalLight(new Color('#fff4e6'), 1.25);
  sun.position.copy(SUN_DIR).multiplyScalar(40);
  sun.target.position.set(0, 0, -1);
  scene.add(sun, sun.target);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const cam = sun.shadow.camera;
    cam.left = -17;
    cam.right = 17;
    cam.top = 14;
    cam.bottom = -14;
    cam.near = 5;
    cam.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 6;
  }

  // Environment: the sky + a meadow-coloured ground, prefiltered for PBR.
  const envScene = new Scene();
  const envSky = createSky(SUN_DIR);
  envSky.mesh.scale.setScalar(0.02);
  envScene.add(envSky.mesh);
  const ground = new Mesh(new CircleGeometry(80, 32), new MeshBasicMaterial({ color: col('#56703c') }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  envScene.add(ground);
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.03, 0.1, 200);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();

  const update = (time: number) => {
    shared.uTime.value = time;
    sky.material.uniforms.uTime.value = time;
    atmosphere.update(time);
  };

  return { sky, terrain, grass, trees, sun, hemi, update };
}
