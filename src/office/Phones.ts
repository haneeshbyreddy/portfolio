import {
  Color,
  Matrix4,
  Mesh,
  Object3D,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Texture,
  Vector3,
} from 'three';
import { GeoBuilder, mat, type Finish } from './builder';
import type { Desk } from './Office';
import { palette } from '../world/palette';
import { shared } from '../world/shared';

/** Handset size in metres: body, and the lit display inside its bezel. */
export const PHONE = { w: 0.072, h: 0.15, d: 0.0085, screenW: 0.0655, screenH: 0.1435 };

/**
 * Where the phone waits, in station space: in a little stand left of the
 * keyboard, leaning back, turned toward the chair. Its local +Z is the screen.
 */
export const PHONE_REST = (() => {
  const tilt = 0.36;
  const lean = (PHONE.h / 2) * Math.cos(tilt);
  return {
    stand: new Vector3(0.37, 0.7405, 0.545),
    center: new Vector3(0.37, 0.752 + lean, 0.545 + Math.sin(tilt) * PHONE.h * 0.5 - 0.012),
    quat: new Quaternion().setFromRotationMatrix(new Matrix4().makeRotationY(Math.PI + 0.55).multiply(new Matrix4().makeRotationX(-tilt))),
  };
})();

/**
 * The "look at this" shot, in station space: the worker holds the phone up
 * beside their head at `hold`, turned to a camera leaning in at `cam` over
 * their left shoulder. The camera rig and the worker's arm both read this.
 */
export const PHONE_SHOT = {
  hold: new Vector3(0.3, 1.24, 0.0),
  cam: new Vector3(0.52, 1.4, -0.64),
  /** Where the camera looks: a little toward the head, so both share the frame. */
  aim: new Vector3(0.22, 1.22, 0.06),
};

const F = {
  shell: { color: palette.crt, rough: 0.5 } as Finish,
  shellShade: { color: '#cdc5b3', rough: 0.55 } as Finish,
  glass: { color: '#0b0d0d', rough: 0.18 } as Finish,
  lens: { color: '#1b1d1f', rough: 0.2, metal: 0.4 } as Finish,
  stand: { color: palette.crtDark, rough: 0.7 } as Finish,
};

/** The handset, facing +Z, centred on its body. */
function phoneGeometry() {
  const b = new GeoBuilder();
  b.box(PHONE.w, PHONE.h, PHONE.d, F.shell, mat(0, 0, 0), 0.0105);
  // the black glass the display sits in
  b.box(PHONE.w - 0.003, PHONE.h - 0.003, 0.001, F.glass, mat(0, 0, PHONE.d / 2 - 0.0002), 0.0005);
  // camera bump on the back
  b.box(0.022, 0.022, 0.0025, F.shellShade, mat(-0.019, 0.054, -PHONE.d / 2 - 0.0008), 0.005);
  b.cyl(0.0042, 0.0042, 0.0015, F.lens, mat(-0.019, 0.058, -PHONE.d / 2 - 0.0022, Math.PI / 2, 0, 0), 12);
  return b.build();
}

/** A folded stand, in station space under the resting phone. */
function standGeometry() {
  const b = new GeoBuilder();
  b.box(0.068, 0.006, 0.07, F.stand, mat(0, 0.003, 0), 0.002);
  // lip the phone rests against
  b.box(0.068, 0.012, 0.006, F.stand, mat(0, 0.009, -0.024), 0.002);
  // back support
  b.box(0.06, 0.09, 0.005, F.stand, mat(0, 0.046, 0.012, 0.36, 0, 0), 0.002);
  return b.build();
}

/** An OLED behind glass: rounded corners, deep blacks, a sheen of sky. */
function createPhoneScreenMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: null as Texture | null },
      uHasMap: { value: 0 },
      uOn: { value: 1 },
      uHover: { value: 0 },
      uAspect: { value: PHONE.screenW / PHONE.screenH },
      uGlass: { value: new Color('#b9c4c6') },
      uVeil: shared.uVeil,
      uFogColor: shared.uFogColor,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uHasMap, uOn, uHover, uAspect, uVeil;
      uniform vec3 uGlass, uFogColor;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        // continuous corners, like the glass they're cut into
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        vec2 hb = vec2(uAspect, 1.0) * 0.5 - 0.075;
        vec2 q = abs(p) - hb;
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.075;
        if (d > 0.0) discard;
        vec3 img = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : vec3(0.0);
        vec3 col = img * uOn * (1.22 + uHover * 0.25);
        float ndv = max(dot(normalize(vN), normalize(vV)), 0.0);
        float fres = pow(1.0 - ndv, 4.0);
        col += uGlass * (0.012 + fres * 0.3);
        float streak = smoothstep(0.18, 0.0, abs(vUv.y - 0.7 + vUv.x * 0.5)) * 0.05;
        col += uGlass * streak;
        col = mix(col, uFogColor, uVeil);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

export interface Phone {
  desk: Desk;
  /** Body + screen, placed by `matrix` each frame. */
  body: Mesh;
  screen: Mesh;
  material: ReturnType<typeof createPhoneScreenMaterial>;
  /** World matrix of the handset right now (the worker may be holding it). */
  matrix: Matrix4;
}

const _m = new Matrix4();
const _s = new Vector3(1, 1, 1);

/**
 * The handsets on desks whose project has a reel. Workers pick them up to
 * show you, so each one is placed every frame from `Workers`.
 */
export class Phones {
  readonly list: Phone[] = [];

  constructor(root: Object3D, desks: Desk[], material: Mesh['material'], shadows: boolean) {
    if (!desks.length) return;
    const body = phoneGeometry();
    const stand = standGeometry();
    const screenGeo = new PlaneGeometry(PHONE.screenW, PHONE.screenH).translate(0, 0, PHONE.d / 2 + 0.0004);
    for (const desk of desks) {
      const s = new Mesh(stand, material);
      s.matrixAutoUpdate = false;
      s.matrix.copy(desk.matrix).multiply(_m.makeTranslation(PHONE_REST.stand.x, PHONE_REST.stand.y, PHONE_REST.stand.z).multiply(new Matrix4().makeRotationY(0.55)));
      s.castShadow = s.receiveShadow = shadows;
      root.add(s);

      const b = new Mesh(body, material);
      b.matrixAutoUpdate = false;
      b.castShadow = b.receiveShadow = shadows;
      root.add(b);

      const screenMat = createPhoneScreenMaterial();
      const screen = new Mesh(screenGeo, screenMat);
      screen.matrixAutoUpdate = false;
      root.add(screen);

      const phone: Phone = { desk, body: b, screen, material: screenMat, matrix: new Matrix4() };
      this.list.push(phone);
      this.place(desk, this.restMatrix(desk, phone.matrix));
    }
  }

  get(desk: Desk) {
    return this.list.find((p) => p.desk === desk) ?? null;
  }

  /** World matrix of a phone sitting in its stand. */
  restMatrix(desk: Desk, out = new Matrix4()) {
    return out.compose(PHONE_REST.center, PHONE_REST.quat, _s).premultiply(desk.matrix);
  }

  place(desk: Desk, world: Matrix4) {
    const p = this.get(desk);
    if (!p) return;
    p.matrix.copy(world);
    p.body.matrix.copy(world);
    p.screen.matrix.copy(world);
    p.body.matrixWorldNeedsUpdate = true;
    p.screen.matrixWorldNeedsUpdate = true;
  }

  /** Viewport-space corners of the display (for the case study to grow out of). */
  screenCorners(desk: Desk) {
    const p = this.get(desk);
    if (!p) return [];
    const hw = PHONE.screenW / 2, hh = PHONE.screenH / 2;
    return [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].map(([x, y]) => new Vector3(x, y, PHONE.d / 2).applyMatrix4(p.matrix));
  }
}
