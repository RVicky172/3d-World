import { describe, expect, it, vi } from 'vitest';
import { Group, type WebGLRenderer } from 'three';
import { createGltfLoader, type LoaderParts } from '../../../../src/shared/model-viewer/loader';

// Spec 011: compressed models load only once the texture transcoder is ready (AC-12), progress is
// reported as a fraction (AC-8), and the decoders' workers are freed when loading settles (AC-13).

const renderer = {} as WebGLRenderer;

function fakeParts(
  overrides: { init?: () => Promise<void>; download?: LoaderParts['file']['loadAsync'] } = {},
) {
  const scene = new Group();
  const parts = {
    file: {
      setResponseType: vi.fn(),
      loadAsync: vi.fn(
        overrides.download ??
          (async (_url: string, onProgress?: (event: ProgressEvent) => void) => {
            onProgress?.(new ProgressEvent('progress', { lengthComputable: true, loaded: 25, total: 100 }));
            onProgress?.(new ProgressEvent('progress', { lengthComputable: true, loaded: 100, total: 100 }));
            return new ArrayBuffer(8);
          }),
      ),
    },
    ktx2: {
      setWorkerLimit: vi.fn(),
      detectSupport: vi.fn(),
      init: vi.fn(overrides.init ?? (async () => {})),
      dispose: vi.fn(),
    },
    gltf: {
      setKTX2Loader: vi.fn(),
      setMeshoptDecoder: vi.fn(),
      parseAsync: vi.fn(async (_data: ArrayBuffer, _path: string) => ({ scene })),
    },
    meshoptDecoder: { supported: true },
  };
  return { parts: parts as unknown as LoaderParts, raw: parts, scene };
}

describe('createGltfLoader (spec 011)', () => {
  it('wires Meshopt and KTX2 decoding into the glTF loader, with KTX2 sized for this GPU', () => {
    const { parts, raw } = fakeParts();
    createGltfLoader(renderer, parts);
    expect(raw.ktx2.detectSupport).toHaveBeenCalledWith(renderer);
    expect(raw.ktx2.setWorkerLimit).toHaveBeenCalledWith(2);
    expect(raw.gltf.setKTX2Loader).toHaveBeenCalledWith(raw.ktx2);
    expect(raw.gltf.setMeshoptDecoder).toHaveBeenCalledWith(raw.meshoptDecoder);
    expect(raw.file.setResponseType).toHaveBeenCalledWith('arraybuffer');
  });

  it('downloads and readies the transcoder in parallel, then parses relative to the file', async () => {
    const { parts, raw, scene } = fakeParts();
    const loader = createGltfLoader(renderer, parts);
    const result = await loader.load('/base/assets/chair/chair.glb');

    expect(raw.ktx2.init).toHaveBeenCalledTimes(1);
    expect(raw.file.loadAsync.mock.calls[0]?.[0]).toBe('/base/assets/chair/chair.glb');
    expect(raw.gltf.parseAsync).toHaveBeenCalledWith(expect.any(ArrayBuffer), '/base/assets/chair/');
    expect(result.scene).toBe(scene);
  });

  it('reports download progress as a fraction, or null when the size is unknown', async () => {
    const progress: Array<number | null> = [];
    const { parts } = fakeParts({
      download: async (_url, onProgress) => {
        onProgress?.(new ProgressEvent('progress', { lengthComputable: true, loaded: 30, total: 120 }));
        onProgress?.(new ProgressEvent('progress', { lengthComputable: false, loaded: 60, total: 0 }));
        return new ArrayBuffer(8);
      },
    });
    await createGltfLoader(renderer, parts).load('/m.glb', (fraction) => progress.push(fraction));
    expect(progress).toEqual([0.25, null]);
  });

  it('rejects without parsing when the transcoder cannot be readied (AC-12)', async () => {
    const { parts, raw } = fakeParts({
      init: async () => {
        throw new Error('transcoder 404');
      },
    });
    await expect(createGltfLoader(renderer, parts).load('/m.glb')).rejects.toThrow('transcoder 404');
    expect(raw.gltf.parseAsync).not.toHaveBeenCalled();
  });

  it('rejects without parsing when the download fails', async () => {
    const { parts, raw } = fakeParts({
      download: async () => {
        throw new Error('offline');
      },
    });
    await expect(createGltfLoader(renderer, parts).load('/m.glb')).rejects.toThrow('offline');
    expect(raw.gltf.parseAsync).not.toHaveBeenCalled();
  });

  it('dispose() frees the transcoder workers (AC-13)', () => {
    const { parts, raw } = fakeParts();
    createGltfLoader(renderer, parts).dispose();
    expect(raw.ktx2.dispose).toHaveBeenCalledTimes(1);
  });
});
