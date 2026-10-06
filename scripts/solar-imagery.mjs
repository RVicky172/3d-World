// @ts-check
// Pure helpers for the dev-only fetch of the Solar System's source maps (spec 022, T004, D-031): what to fetch,
// how big to ship it, and how to turn every map into one convention (0° longitude at the centre, east to the
// right) so the app needs no per-map offsets. Unit-tested from tests/unit/scripts/solar-imagery.test.ts; the
// network calls live in scripts/fetch-solar-imagery.mjs.

const SSS = 'https://www.solarsystemscope.com/textures/download';
const SSS_PAGE = 'https://www.solarsystemscope.com/textures/';
const SSS_CREDIT = 'Solar System Scope (INOVE), based on NASA mission data';
const USGS = 'https://astrogeology.usgs.gov/ckan/dataset';
const USGS_PAGE = 'https://astrogeology.usgs.gov/search/map';
const NASA_PIA = 'https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia';
const EO = 'https://eoimages.gsfc.nasa.gov/images/imagerecords';

/**
 * @typedef {object} SourceMap
 * @property {string} id body id, or `<body>-<layer>`
 * @property {string} url the file fetched
 * @property {string} page where its licence and description are stated
 * @property {string} credit author line for CREDITS.md
 * @property {'Public domain' | 'CC BY 4.0'} licence
 * @property {number} leftEdgeLongitudeDeg east-positive longitude at the map's left edge (all run east to the right)
 * @property {number} [tint] body colour (0xRRGGBB) laid over a greyscale map (D-031)
 * @property {number} [contrast] 0–1: squeeze a map's contrast before tinting (Titan, D-031)
 * @property {boolean} [fillNoData] fill unmapped (pure black) areas with the mapped average (moon mosaics with gaps)
 */

/** @type {readonly SourceMap[]} */
export const IMAGERY = [
  {
    id: 'sun',
    url: `${SSS}/2k_sun.jpg`,
    page: SSS_PAGE,
    credit: SSS_CREDIT,
    licence: 'CC BY 4.0',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'mercury',
    url: `${NASA_PIA}/pia16/pia16298/PIA16298.jpg`,
    page: 'https://science.nasa.gov/photojournal/a-world-view/',
    credit:
      'NASA/Johns Hopkins University Applied Physics Laboratory/Carnegie Institution of Washington (MESSENGER)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: -180,
    tint: 0x9a8f86,
  },
  {
    id: 'venus',
    url: `${SSS}/2k_venus_atmosphere.jpg`,
    page: SSS_PAGE,
    credit: SSS_CREDIT,
    licence: 'CC BY 4.0',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'earth',
    url: `${EO}/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg`,
    page: 'https://visibleearth.nasa.gov/images/73909',
    credit: 'NASA Earth Observatory, Reto Stöckli (Blue Marble Next Generation, December 2004)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'earth-clouds',
    url: `${EO}/57000/57747/cloud_combined_2048.jpg`,
    page: 'https://visibleearth.nasa.gov/images/57747',
    credit: 'NASA Goddard Space Flight Center, Reto Stöckli (Blue Marble clouds)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'earth-night',
    url: `${EO}/144000/144898/BlackMarble_2016_3km.jpg`,
    page: 'https://visibleearth.nasa.gov/images/144898',
    credit: 'NASA Earth Observatory, Joshua Stevens, Miguel Román (Black Marble 2016)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'earth-ocean',
    url: `${SSS}/2k_earth_specular_map.tif`,
    page: SSS_PAGE,
    credit: SSS_CREDIT,
    licence: 'CC BY 4.0',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'moon',
    url: `${USGS}/db948a2d-4d6a-4775-a0d3-12613d36f9e7/resource/d24d5ef3-abc5-42ee-ac7c-4c3261106327/download/moon_lro_lroc-wac_mosaic_global_1024.jpg`,
    page: `${USGS_PAGE}/moon_lro_lroc_wac_global_morphology_mosaic_100m`,
    credit: 'NASA/GSFC/Arizona State University (LROC WAC), USGS Astrogeology',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'mars',
    url: `${USGS}/7131d503-cdc9-45a5-8f83-5126c0fd397e/resource/5ea881c6-01b3-41fa-a7af-42d2131b54f1/download/Mars_Viking_MDIM21_ClrMosaic_1km.jpg`,
    page: `${USGS_PAGE}/mars_viking_colorized_global_mosaic_232m`,
    credit: 'NASA/JPL, NASA Ames, USGS Astrogeology (Viking MDIM 2.1 colourised)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'jupiter',
    url: `${NASA_PIA}/pia07/pia07782/PIA07782.jpg`,
    page: 'https://photojournal.jpl.nasa.gov/catalog/PIA07782',
    credit: 'NASA/JPL/Space Science Institute (Cassini)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: -180, // labelled 180°W … 0° … 180°W, west decreasing rightwards
  },
  {
    id: 'saturn',
    url: `${SSS}/2k_saturn.jpg`,
    page: SSS_PAGE,
    credit: SSS_CREDIT,
    licence: 'CC BY 4.0',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'saturn-rings',
    url: `${SSS}/2k_saturn_ring_alpha.png`,
    page: SSS_PAGE,
    credit: SSS_CREDIT,
    licence: 'CC BY 4.0',
    leftEdgeLongitudeDeg: -180, // a radial strip: no longitude, never rolled
  },
  {
    id: 'uranus',
    url: `${SSS}/2k_uranus.jpg`,
    page: SSS_PAGE,
    credit: SSS_CREDIT,
    licence: 'CC BY 4.0',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'neptune',
    url: `${SSS}/2k_neptune.jpg`,
    page: SSS_PAGE,
    credit: SSS_CREDIT,
    licence: 'CC BY 4.0',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'io',
    url: `${USGS}/f6924861-ce9c-490d-8a4b-7812a20f2de5/resource/a9fab679-8081-4144-9f58-45848836c8f5/download/full.jpg`,
    page: `${USGS_PAGE}/io_galileo_ssi_voyager_color_merged_global_mosaic_1km`,
    credit: 'NASA/JPL, USGS Astrogeology (Galileo SSI / Voyager)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: -180,
  },
  {
    id: 'europa',
    url: `${USGS}/4080036f-afc5-422e-abe9-1c0c8e4f98ea/resource/3647e7b3-425e-4dcf-951b-cc4a22fb0129/download/europa_voyager_galileossi_global_mosaic_500m_1024.jpg`,
    page: `${USGS_PAGE}/Europa/Voyager-Galileo/Europa_Voyager_GalileoSSI_global_mosaic_500m`,
    credit: 'NASA/JPL, USGS Astrogeology (Voyager / Galileo SSI)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: 0,
    tint: 0xcfc2a8,
    fillNoData: true, // no data south of −83°
  },
  {
    id: 'ganymede',
    url: `${USGS}/e1422336-3291-4b65-b903-c942d53de073/resource/eb32abd7-fee2-47d1-9f96-9d7d8824cc3a/download/ganymede_voyager_galileossi_global_clrmosaic_1024.jpg`,
    page: `${USGS_PAGE}/ganymede_voyager_galileo_ssi_color_global_mosaic_1_4km`,
    credit: 'NASA/JPL, USGS Astrogeology (Voyager / Galileo SSI)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: 0,
    fillNoData: true, // south polar gap
  },
  {
    id: 'callisto',
    url: `${USGS}/a80abd68-7ed9-440e-829a-76376779164f/resource/ac628525-cb1c-4742-928b-5a0a60f372cd/download/callisto_voyager_galileossi_global_mosaic_1024.jpg`,
    page: `${USGS_PAGE}/callisto_galileo_voyager_global_mosaic_1km`,
    credit: 'NASA/JPL, USGS Astrogeology (Galileo SSI / Voyager)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: 0,
    tint: 0x6e655c,
    fillNoData: true, // south polar gap
  },
  {
    id: 'titan',
    url: 'https://planetarymaps.usgs.gov/mosaic/Titan_ISS_P19658_Mosaic_Global_4km.tif',
    page: `${USGS_PAGE}/titan_cassini_iss_global_mosaic_4005m`,
    credit: 'NASA/JPL/Space Science Institute (Cassini ISS), USGS Astrogeology',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: 0,
    tint: 0xd4a95a,
    contrast: 0.35,
  },
  {
    id: 'triton',
    url: `${USGS}/445b4c39-e87a-4e4d-88a8-e48d8e755c5c/resource/de0ba9f1-303e-4e5f-a99a-3201fba9a764/download/triton_voyager2_clrmosaic_1024.jpg`,
    page: `${USGS_PAGE}/triton_voyager_2_global_color_mosaic_600m`,
    credit: 'NASA/JPL, Lunar and Planetary Institute (Paul Schenk), USGS Astrogeology (Voyager 2)',
    licence: 'Public domain',
    leftEdgeLongitudeDeg: -180,
    fillNoData: true, // Voyager 2 saw only the southern hemisphere
  },
];

const PLANETS = new Set(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);

/**
 * Shipping size (D-029): 2K for the planets, 1K for the rest. The rings are a radial strip: width only.
 * @param {string} id
 * @returns {{ width: number; height: number }}
 */
export function targetSize(id) {
  const width = PLANETS.has(id) ? 2048 : 1024;
  return { width, height: id === 'saturn-rings' ? 0 : width / 2 };
}

/**
 * Where the fetched source is written: JPEG, except the rings (PNG, for their alpha).
 * @param {string} id
 * @returns {string}
 */
export function outputPath(id) {
  return `assets-src/solar-system/${id}.${id === 'saturn-rings' ? 'png' : 'jpg'}`;
}

/**
 * Columns to roll so a map whose left edge is at `leftEdgeLongitudeDeg` (east, running east to the right) starts
 * at −180° instead: output column j shows input column (j + shift) mod width.
 * @param {number} width
 * @param {number} leftEdgeLongitudeDeg
 * @returns {number}
 */
export function columnShift(width, leftEdgeLongitudeDeg) {
  const turns = ((((-180 - leftEdgeLongitudeDeg) / 360) % 1) + 1) % 1;
  return Math.round(turns * width) % width;
}

/**
 * Rolls each row of interleaved pixels left by `shift` columns. Returns a new array.
 * @param {Uint8Array} pixels
 * @param {number} width
 * @param {number} height
 * @param {number} channels
 * @param {number} shift
 * @returns {Uint8Array}
 */
export function rollColumns(pixels, width, height, channels, shift) {
  const out = new Uint8Array(pixels.length);
  const row = width * channels;
  const cut = (((shift % width) + width) % width) * channels;
  for (let y = 0; y < height; y++) {
    const start = y * row;
    out.set(pixels.subarray(start + cut, start + row), start);
    out.set(pixels.subarray(start, start + cut), start + row - cut);
  }
  return out;
}

/**
 * Unmapped areas of a mosaic are pure black; on a sphere they read as holes. Pixels whose every channel is at or
 * below `threshold` take the mean colour of the mapped pixels, so gaps stay visible as plain, not as black.
 * Returns a new array.
 * @param {Uint8Array} pixels interleaved, `channels` per pixel
 * @param {number} channels
 * @param {number} threshold
 * @returns {Uint8Array}
 */
export function fillNoData(pixels, channels, threshold) {
  const out = Uint8Array.from(pixels);
  const sum = new Array(channels).fill(0);
  let mapped = 0;
  const empty = (/** @type {number} */ i) => {
    for (let c = 0; c < channels; c++) if ((pixels[i + c] ?? 0) > threshold) return false;
    return true;
  };
  for (let i = 0; i < pixels.length; i += channels) {
    if (empty(i)) continue;
    mapped++;
    for (let c = 0; c < channels; c++) sum[c] += pixels[i + c] ?? 0;
  }
  if (mapped === 0) return out;
  const mean = sum.map((v) => Math.round(v / mapped));
  for (let i = 0; i < pixels.length; i += channels) {
    if (empty(i)) for (let c = 0; c < channels; c++) out[i + c] = mean[c] ?? 0;
  }
  return out;
}
