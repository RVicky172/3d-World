import { describe, expect, it, vi } from 'vitest';
import { CompressedTexture, type WebGLRenderer } from 'three';
import { configureKtx2, createKtx2, type Ktx2LoaderLike } from '../../../src/shared/ktx2';

// Spec 022, T011 (AC-11): one KTX2 setup shared by the model viewer (011) and the Solar System's standalone
// textures: sized for this GPU, the transcoder readied once, progress in bytes, failures rejected, workers freed.

const renderer = {} as WebGLRenderer;

function fakeLoader(overrides: { init?: () => Promise<void>; fail?: string } = {}) {
  const loader = {
    setWorkerLimit: vi.fn(),
    detectSupport: vi.fn(),
    init: vi.fn(overrides.init ?? (async () => {})),
    dispose: vi.fn(),
    loadAsync: vi.fn(async (_url: string, onProgress?: (event: ProgressEvent) => void) => {
      if (overrides.fail) throw new Error(overrides.fail);
      onProgress?.(new ProgressEvent('progress', { lengthComputable: true, loaded: 400, total: 1000 }));
      onProgress?.(new ProgressEvent('progress', { lengthComputable: true, loaded: 1000, total: 1000 }));
      return new CompressedTexture([], 4, 4);
    }),
  };
  return loader as typeof loader & Ktx2LoaderLike;
}

describe('configureKtx2', () => {
  it('sizes the transcoder for this GPU with a small worker pool', () => {
    const loader = fakeLoader();
    configureKtx2(loader, renderer);
    expect(loader.detectSupport).toHaveBeenCalledWith(renderer);
    expect(loader.setWorkerLimit).toHaveBeenCalledWith(2);
  });
});

describe('createKtx2 (standalone textures)', () => {
  it('configures the loader on creation', () => {
    const loader = fakeLoader();
    createKtx2(renderer, loader);
    expect(loader.detectSupport).toHaveBeenCalledWith(renderer);
  });

  it('loads a texture once the transcoder is ready, reporting bytes loaded', async () => {
    const loader = fakeLoader();
    const ktx2 = createKtx2(renderer, loader);
    const bytes: number[] = [];
    const texture = await ktx2.load('/assets/solar-system/mars.ktx2', (loaded) => bytes.push(loaded));
    expect(texture).toBeInstanceOf(CompressedTexture);
    expect(loader.init).toHaveBeenCalledTimes(1);
    expect(loader.loadAsync.mock.calls[0]?.[0]).toBe('/assets/solar-system/mars.ktx2');
    expect(bytes).toEqual([400, 1000]);
  });

  it('readies the transcoder only once for many textures', async () => {
    const loader = fakeLoader();
    const ktx2 = createKtx2(renderer, loader);
    await Promise.all([ktx2.load('/a.ktx2'), ktx2.load('/b.ktx2'), ktx2.load('/c.ktx2')]);
    expect(loader.init).toHaveBeenCalledTimes(1);
    expect(loader.loadAsync).toHaveBeenCalledTimes(3);
  });

  it('rejects when the transcoder fails to start, without downloading', async () => {
    const loader = fakeLoader({ init: async () => Promise.reject(new Error('transcoder 404')) });
    const ktx2 = createKtx2(renderer, loader);
    await expect(ktx2.load('/a.ktx2')).rejects.toThrow('transcoder 404');
    expect(loader.loadAsync).not.toHaveBeenCalled();
  });

  it('rejects when a file fails to load', async () => {
    const ktx2 = createKtx2(renderer, fakeLoader({ fail: 'HTTP 404' }));
    await expect(ktx2.load('/missing.ktx2')).rejects.toThrow('HTTP 404');
  });

  it('dispose() frees the transcoder workers', () => {
    const loader = fakeLoader();
    createKtx2(renderer, loader).dispose();
    expect(loader.dispose).toHaveBeenCalledTimes(1);
  });
});
