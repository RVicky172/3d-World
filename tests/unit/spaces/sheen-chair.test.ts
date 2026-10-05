import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
