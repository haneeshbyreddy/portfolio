import { Color } from 'three';

/**
 * Art direction lives here. Overcast meadow light (refs 3 + 4), with the
 * sage/ink/bone palette of the Severance one-sheet for the built objects.
 */
export const palette = {
  // atmosphere
  skyZenith: '#5f676c',
  skyMid: '#8a9397',
  horizon: '#c3c9c7',
  fog: '#b7bfbc',
  cloudDark: '#5b6266',
  cloudLight: '#c9cdcb',
  sunGlow: '#fff3df',

  // land
  grassRoot: '#1a2c15',
  grassMid: '#4a7230',
  grassTip: '#a5c75c',
  grassDry: '#b8b06e',
  grassSheen: '#d9e6b8',
  /** Grass that's been walked on and sat on all day: laid over, paler. */
  grassTrod: '#a3ad6a',
  /** The rooms mown out of the meadow for the camp: fresh-cut lawn, and its shade at the roots. */
  lawn: '#6f9b42',
  lawnDeep: '#44702a',
  soil: '#26351c',
  forest: '#24331f',
  forestLight: '#3a4d2c',
  hillFar: '#5d6f68',

  // office (Severance one-sheet)
  deskWhite: '#ecebe6',
  deskShade: '#dedcd5',
  crt: '#ddd5c4',
  crtDark: '#2a2a27',
  keyCap: '#e9e3d5',
  keyDark: '#bdb4a3',
  chairFabric: '#2b2f31',
  chairBase: '#18191b',
  chrome: '#a2a6a8',

  // the camp: everything someone carried out onto the grass. Green, white and
  // one orange — safety orange is the cord that powers the field, and the only
  // loud colour in it; everything else is a natural material.
  cord: '#e2601e',
  cordDark: '#1e1f1d',
  rust: '#c35a2c',
  canvas: '#ddd4be',
  canvasShade: '#c7bda6',
  pine: '#b88a5a',
  pineDark: '#7c5b3b',
  kraft: '#c6a375',
  olive: '#5c6340',
  slate: '#4d6273',
  cooler: '#3f6e91',
  bone: '#eeeae0',
  campFrame: '#1d1f1e',
  bikeRed: '#a63a2d',
  bikeMint: '#8db8a7',
  leather: '#7a4a2c',
} as const;

export const col = (hex: string) => new Color(hex);
