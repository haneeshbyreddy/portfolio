import { bakeSheet, SHEET_VARIANTS } from './sheetBake';

// Bakes every dust sheet off the main thread while the loader runs.
self.onmessage = () => {
  const bakes = SHEET_VARIANTS.map(bakeSheet);
  const transfer = bakes.flatMap((b) => [b.rest.buffer, ...b.frames.map((f) => f.buffer)]);
  (self as unknown as Worker).postMessage(bakes, transfer);
};
