import { CompressedTexture, RepeatWrapping } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ktx2 } from '../../../../src/shared/ktx2';
import { BODIES } from '../../../../src/spaces/solar-system/data';
import {
  createFader,
  FADE_SECONDS,
  imageryJobs,
  loadImagery,
  type ImageryLayer,
} from '../../../../src/spaces/solar-system/imagery';
import type { BodyData } from '../../../../src/spaces/solar-system/types';

// Spec 022, T043 (AC-11, AC-12): imagery arrives after the Space has opened. Progress counts bytes; each texture is
// handed to its body and layer; a failure leaves that body coloured and warns once; leaving mid-load disposes
// whatever arrives late; the transcoder is freed once everything has settled.

const BASE = '/base/assets/solar-system/';

/** A KTX2 stub whose loads finish when the test says so. */
function stubKtx2() {
  const pending = new Map<
    string,
    { resolve: (t: CompressedTexture) => void; reject: (e: Error) => void; onBytes?: (n: number) => void }
  >();
  const ktx2 = {
    load: vi.fn(
      (url: string, onBytes?: (n: number) => void) =>
        new Promise<CompressedTexture>((resolve, reject) => pending.set(url, { resolve, reject, onBytes })),
    ),
    dispose: vi.fn(),
  } satisfies Ktx2;
  const texture = () => {
    const t = new CompressedTexture([], 4, 4);
    vi.spyOn(t, 'dispose');
    return t;
  };
  return {
    ktx2,
    urls: () => [...pending.keys()],
    bytes: (file: string, n: number) => pending.get(BASE + file)!.onBytes?.(n),
    finish(file: string) {
      const t = texture();
      pending.get(BASE + file)!.resolve(t);
      return t;
    },
    fail: (file: string) => pending.get(BASE + file)!.reject(new Error(`404 ${file}`)),
    finishAll() {
      for (const { resolve } of pending.values()) resolve(texture());
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function start(options: { bodies?: readonly BodyData[]; signal?: AbortSignal } = {}) {
  const stub = stubKtx2();
  const delivered: [string, ImageryLayer, CompressedTexture][] = [];
  const progress: number[] = [];
  const done = loadImagery({
    bodies: options.bodies ?? BODIES,
    baseUrl: BASE,
    loader: stub.ktx2,
    signal: options.signal ?? new AbortController().signal,
    onTexture: (id, layer, texture) => delivered.push([id, layer, texture as CompressedTexture]),
    onProgress: (fraction) => progress.push(fraction),
  });
  return { stub, delivered, progress, done };
}

afterEach(() => vi.restoreAllMocks());

describe('imageryJobs', () => {
  it('lists every body’s surface, Earth’s three layers and Saturn’s ring profile, with their bytes', () => {
    const jobs = imageryJobs(BODIES);
    expect(jobs).toHaveLength(BODIES.length + 3 + 1);
    expect(jobs.filter((j) => j.layer === 'surface').map((j) => j.id)).toEqual(BODIES.map((b) => b.id));
    expect(jobs.filter((j) => j.id === 'earth').map((j) => j.layer)).toEqual([
      'surface',
      'clouds',
      'night',
      'ocean',
    ]);
    expect(jobs.find((j) => j.layer === 'rings')).toMatchObject({ id: 'saturn', file: 'saturn-rings.ktx2' });
    expect(new Set(jobs.map((j) => j.file)).size).toBe(jobs.length);
    for (const job of jobs) expect(job.bytes).toBeGreaterThan(0);
  });
});

describe('loadImagery', () => {
  it('loads each file from the base URL and hands it to its body and layer', async () => {
    const { stub, delivered, done } = start();
    expect(stub.urls()).toEqual(imageryJobs(BODIES).map((j) => BASE + j.file));
    const clouds = stub.finish('earth-clouds.ktx2');
    stub.finishAll();
    expect(await done).toEqual({ failed: [] });
    expect(delivered).toHaveLength(imageryJobs(BODIES).length);
    expect(delivered).toContainEqual(['earth', 'clouds', clouds]);
  });

  it('reports progress as bytes loaded over the total, rising, ending at exactly 1', async () => {
    const { stub, progress, done } = start();
    const total = imageryJobs(BODIES).reduce((sum, j) => sum + j.bytes, 0);
    const earth = BODIES.find((b) => b.id === 'earth')!.imagery.bytes;
    stub.bytes('earth.ktx2', earth / 2);
    expect(progress.at(-1)).toBeCloseTo(earth / 2 / total, 12);
    stub.bytes('earth.ktx2', earth * 3); // a byte count over the recorded size never overshoots
    expect(progress.at(-1)).toBeCloseTo(earth / total, 12);
    stub.finishAll();
    await done;
    expect(progress.at(-1)).toBe(1);
    expect(progress.filter((p) => p === 1)).toHaveLength(1);
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]!);
  });

  it('puts a map’s 0° longitude on the prime meridian from its recorded left edge', async () => {
    const [sun] = BODIES;
    const shifted = {
      ...sun!,
      id: 'shifted',
      imagery: { ...sun!.imagery, file: 'shifted.ktx2', leftEdgeLongitudeDeg: 0 },
    };
    const { stub, delivered, done } = start({ bodies: [sun!, shifted] });
    stub.finishAll();
    await done;
    const [standard, offset] = delivered.map(([, , t]) => t);
    expect(standard!.offset.x).toBe(0); // 0° at the centre: as SphereGeometry expects (surfaces.ts)
    expect(offset!.offset.x).toBeCloseTo(-0.5, 12); // 0° at the left edge: half a turn
    expect(offset!.wrapS).toBe(RepeatWrapping);
  });

  it('a failed image leaves that body out, the rest still load, and it warns once in all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { stub, delivered, progress, done } = start();
    stub.fail('jupiter.ktx2');
    stub.fail('earth-night.ktx2');
    stub.finishAll();
    const { failed } = await done;
    expect(failed).toEqual(['earth:night', 'jupiter:surface']);
    expect(delivered.map(([id, layer]) => `${id}:${layer}`)).not.toContain('jupiter:surface');
    expect(delivered).toHaveLength(imageryJobs(BODIES).length - 2);
    expect(progress.at(-1)).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toMatch(/jupiter/);
  });

  it('a texture its body can’t take is disposed and counted as failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stub = stubKtx2();
    const done = loadImagery({
      bodies: BODIES.slice(0, 1),
      baseUrl: BASE,
      loader: stub.ktx2,
      signal: new AbortController().signal,
      onTexture: () => {
        throw new Error('no such body');
      },
      onProgress: () => {},
    });
    const texture = stub.finish('sun.ktx2');
    expect(await done).toEqual({ failed: ['sun:surface'] });
    expect(texture.dispose).toHaveBeenCalledOnce();
  });

  it('after an abort, late textures are disposed, nothing is reported, nothing warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = new AbortController();
    const { stub, delivered, progress, done } = start({ signal: controller.signal });
    stub.finish('sun.ktx2');
    await flush();
    expect(delivered).toHaveLength(1);
    const reports = progress.length;
    controller.abort();
    const late = stub.finish('earth.ktx2');
    stub.fail('jupiter.ktx2');
    stub.finishAll();
    await done;
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(delivered).toHaveLength(1);
    expect(progress).toHaveLength(reports);
    expect(warn).not.toHaveBeenCalled();
  });

  it('frees the transcoder once every load has settled, and not before', async () => {
    const { stub, done } = start();
    stub.finish('sun.ktx2');
    await flush();
    expect(stub.ktx2.dispose).not.toHaveBeenCalled();
    stub.finishAll();
    await done;
    expect(stub.ktx2.dispose).toHaveBeenCalledOnce();
  });

  it('with the signal already aborted, loads nothing and frees the transcoder', async () => {
    const controller = new AbortController();
    controller.abort();
    const { stub, done } = start({ signal: controller.signal });
    expect(await done).toEqual({ failed: [] });
    expect(stub.ktx2.load).not.toHaveBeenCalled();
    expect(stub.ktx2.dispose).toHaveBeenCalledOnce();
  });
});

describe('createFader', () => {
  it('fades 0 → 1 over FADE_SECONDS of Space time, then lets go', () => {
    const fader = createFader(false);
    const apply = vi.fn();
    fader.add(apply);
    expect(apply).toHaveBeenLastCalledWith(0);
    expect(fader.active).toBe(1);
    fader.advance(FADE_SECONDS / 2);
    expect(apply).toHaveBeenLastCalledWith(0.5);
    fader.advance(FADE_SECONDS);
    expect(apply).toHaveBeenLastCalledWith(1);
    expect(fader.active).toBe(0);
    apply.mockClear();
    fader.advance(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it('under reduced motion, shows each image at once', () => {
    const fader = createFader(true);
    const apply = vi.fn();
    fader.add(apply);
    expect(apply.mock.calls).toEqual([[1]]);
    expect(fader.active).toBe(0);
  });

  it('clear() drops every fade in progress', () => {
    const fader = createFader(false);
    const apply = vi.fn();
    fader.add(apply);
    fader.clear();
    apply.mockClear();
    fader.advance(1);
    expect(apply).not.toHaveBeenCalled();
    expect(fader.active).toBe(0);
  });
});
