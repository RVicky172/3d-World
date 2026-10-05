import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { SHEEN_CHAIR } from '../../../src/spaces/sheen-chair/data';

/** SPDX id → how the licence is written in CREDITS.md. Constitution IX: nothing else is allowed. */
const CREDITS_LICENSE: Record<string, string> = {
  'CC0-1.0': 'CC0 1.0',
  'CC-BY-4.0': 'CC BY 4.0',
  'Public domain': 'Public domain',
};

/** Rows of the table in public/assets/CREDITS.md, keyed by the asset path in its Path column. */
function creditsRows(): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of readFileSync('public/assets/CREDITS.md', 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const path = cells[1]?.replace(/`/g, '');
    if (path) rows.set(path, cells);
  }
  return rows;
}

describe('sheen-chair data (spec 010, AC-14)', () => {
  it('describes the model, camera and turntable as valid data', () => {
    const { title, model, camera, turntable, fill } = SHEEN_CHAIR;
    expect(title.trim()).not.toBe('');
    expect(model.path).toMatch(/^assets\/sheen-chair\/[\w-]+\.glb$/);
    expect(camera.fov).toBeGreaterThan(10);
    expect(camera.fov).toBeLessThan(100);
    expect(Math.hypot(...camera.direction)).toBeGreaterThan(0);
    expect(turntable.speed).toBeGreaterThan(0);
    expect(turntable.idleDelay).toBeGreaterThan(0);
    if (fill !== undefined) {
      expect(fill).toBeGreaterThanOrEqual(0.5);
      expect(fill).toBeLessThanOrEqual(0.9);
    }
  });

  it('credits the model file it loads', () => {
    expect(SHEEN_CHAIR.assets.map((asset) => asset.path)).toContain(SHEEN_CHAIR.model.path);
  });
});

describe('sheen-chair licences (spec 010, AC-13)', () => {
  const rows = creditsRows();

  it.each(SHEEN_CHAIR.assets.map((asset) => [asset.path, asset] as const))(
    '%s exists, with a CREDITS.md row naming its author and an allowed licence',
    (path, asset) => {
      expect(existsSync(`public/${path}`), 'file exists under public/').toBe(true);
      const row = rows.get(path);
      expect(row, 'CREDITS.md row').toBeDefined();
      const [, , source = '', author = '', license = ''] = row ?? [];
      expect(CREDITS_LICENSE[asset.license], 'allowed licence').toBeDefined();
      expect(license).toBe(CREDITS_LICENSE[asset.license]);
      expect(author).toContain(asset.author);
      expect(source).toContain(asset.source);
    },
  );
});

/** The JSON chunk of a GLB (bytes 20…20+length, length = uint32 at byte 12). */
function glbJson(path: string): { extensionsUsed?: string[]; extensionsRequired?: string[] } {
  const bytes = readFileSync(path);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
}

describe('sheen-chair compressed model (spec 011)', () => {
  const file = `public/${SHEEN_CHAIR.model.path}`;

  it('AC-1: ships at most 1.5 MB', () => {
    expect(readFileSync(file).byteLength).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });

  it('AC-1: uses Meshopt geometry and KTX2 textures, and keeps the velvet sheen', () => {
    const { extensionsUsed = [], extensionsRequired = [] } = glbJson(file);
    expect(extensionsUsed).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu', 'KHR_materials_sheen']),
    );
    // Required, so a viewer that can't decode them fails loudly instead of rendering garbage.
    expect(extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
  });

  it('AC-15: its CREDITS row says it was converted', () => {
    const [asset = ''] = creditsRows().get(SHEEN_CHAIR.model.path) ?? [];
    expect(asset).toMatch(/converted: Meshopt \+ KTX2/);
  });
});

/** The source model's bounds, in the same (glTF scene) coordinates the hotspot positions use. */
async function sourceBounds(): Promise<{ min: number[]; max: number[] }> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.read('assets-src/sheen-chair/SheenChair.glb');
  const [scene] = document.getRoot().listScenes();
  return getBounds(scene!);
}

describe('sheen-chair hotspots (spec 012, AC-5, AC-13)', () => {
  const hotspots = SHEEN_CHAIR.hotspots ?? [];

  it('has the four approved hotspots, in order, with unique kebab-case ids (D-021)', () => {
    expect(hotspots.map((h) => h.id)).toEqual(['seat', 'frame', 'legs', 'label']);
    for (const { id } of hotspots) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(hotspots.map((h) => [h.id, h] as const))(
    '%s: a title of ≤ 4 words and a text of ≤ 2 sentences',
    (_, h) => {
      expect(h.title.trim()).not.toBe('');
      expect(h.title.trim().split(/\s+/).length).toBeLessThanOrEqual(4);
      expect(h.text.trim()).not.toBe('');
      expect(h.text.match(/[.!?](\s|$)/g)?.length ?? 0).toBeLessThanOrEqual(2);
    },
  );

  it('places every point within the model’s bounds (+2 %)', async () => {
    const { min, max } = await sourceBounds();
    for (const { id, position } of hotspots) {
      position.forEach((c, axis) => {
        const margin = 0.02 * (max[axis]! - min[axis]!);
        expect(c, `${id} axis ${axis}`).toBeGreaterThanOrEqual(min[axis]! - margin);
        expect(c, `${id} axis ${axis}`).toBeLessThanOrEqual(max[axis]! + margin);
      });
    }
  });

  it('gives every hotspot a viewing direction the controls can reach (polar limits, 0.15 rad from the poles)', () => {
    for (const { id, view } of hotspots) {
      const length = Math.hypot(...view);
      expect(length, id).toBeGreaterThan(0);
      const polar = Math.acos(view[1] / length);
      expect(polar, id).toBeGreaterThanOrEqual(0.15);
      expect(polar, id).toBeLessThanOrEqual(Math.PI - 0.15);
    }
  });
});
