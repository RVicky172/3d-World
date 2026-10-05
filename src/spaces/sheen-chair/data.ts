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
  // Spec 012 (D-021): points raycast onto each part in the 012 T040 probe, each visible from its own view.
  // The back shell and the label face away from the home view, so their markers start dimmed.
  hotspots: [
    {
      id: 'seat',
      title: 'Velvet upholstery',
      text: 'The seat and back cushions are covered in velvet. Its short pile catches light at grazing angles, which gives the soft sheen along the edges.',
      position: [-0.001, 0.358, 0.096],
      view: [0, 0.6, 1],
    },
    {
      id: 'frame',
      title: 'Wooden frame',
      text: 'A curved wooden shell holds the back cushion. The posts that carry it run down into the back legs.',
      position: [0.003, 0.564, -0.257],
      view: [0.3, 0.3, -1],
    },
    {
      id: 'legs',
      title: 'Wooden legs',
      text: 'Four tapered wooden legs stand on small metal glides. Small metal fittings join them to the frame.',
      position: [0.325, 0.121, 0.208],
      view: [1, 0.1, 0.6],
    },
    {
      id: 'label',
      title: 'Printed label',
      text: 'A printed label is fixed to the board under the seat.',
      position: [0, 0.239, 0.029],
      view: [0.2, -0.9, 0.6],
    },
  ],
};
