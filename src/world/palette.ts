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
  grassMid: '#45672c',
  grassTip: '#9fbd62',
  grassDry: '#b8b06e',
  grassSheen: '#d9e6b8',
  lawnA: '#5f8a3c',
  lawnB: '#557f35',
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
  sheet: '#e9e3d6',
} as const;

export const col = (hex: string) => new Color(hex);
