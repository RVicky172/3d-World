import type { ModelViewerConfig } from '../../shared/model-viewer';

/** Scene data (Constitution VII, spec 010 AC-14). The view is auto-framed, so no distances here. */
export const SHEEN_CHAIR: ModelViewerConfig = {
  title: 'Sheen Chair',
  model: { path: 'assets/sheen-chair/SheenChair.glb' },
  // Front three-quarter view from slightly above, so the velvet seat and the arms both show.
  camera: { fov: 40, direction: [0.8, 0.45, 1] },
  // The bounding sphere over-estimates an open shape like a chair: at the default 0.75 its outline filled
  // only ~53 % of the smaller dimension, so ask for more to land mid-band (AC-2: 50–90 %).
  fill: 0.85,
  turntable: { speed: 1, idleDelay: 4 },
  assets: [
    {
      path: 'assets/sheen-chair/SheenChair.glb',
      title: 'SheenChair',
      author: 'Eric Chadwick, © 2020 Wayfair, LLC',
      license: 'CC0-1.0',
      source: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair',
    },
  ],
};
