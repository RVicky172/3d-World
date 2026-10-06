import { FileLoader, LoaderUtils, type Object3D, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { configureKtx2 } from '../ktx2';

/** Loads one model and reports download progress: 0–1, or null when the size is unknown (spec 011). */
export interface ModelLoader {
  load(url: string, onProgress?: (fraction: number | null) => void): Promise<{ scene: Object3D }>;
  /** Frees the texture transcoder's workers. Call it once loading has settled. */
  dispose(): void;
}

/** The three.js pieces the loader is built from; replaced by fakes in unit tests. */
export interface LoaderParts {
  file: Pick<FileLoader, 'setResponseType' | 'loadAsync'>;
  ktx2: Pick<KTX2Loader, 'setWorkerLimit' | 'detectSupport' | 'init' | 'dispose'>;
  gltf: Pick<GLTFLoader, 'setKTX2Loader' | 'setMeshoptDecoder' | 'parseAsync'>;
  meshoptDecoder: typeof MeshoptDecoder;
}

/**
 * glTF loader for the asset pipeline's output (spec 011): Meshopt geometry (`EXT_meshopt_compression`) and
 * KTX2 textures (`KHR_texture_basisu`), transcoded to whatever format this GPU supports.
 *
 * The transcoder setup is shared (`configureKtx2`, `src/shared/ktx2.ts`). The file download and the
 * transcoder start in parallel, and the model is parsed only once both are ready. GLTFLoader swallows texture
 * errors (it logs them and renders untextured), so a transcoder failure must reject here, before parsing, to
 * reach "Failed to load" (AC-12).
 */
export function createGltfLoader(renderer: WebGLRenderer, parts: LoaderParts = defaultParts()): ModelLoader {
  const { file, ktx2, gltf, meshoptDecoder } = parts;
  file.setResponseType('arraybuffer');
  configureKtx2(ktx2, renderer); // shared with standalone textures (022)
  gltf.setKTX2Loader(ktx2 as KTX2Loader);
  gltf.setMeshoptDecoder(meshoptDecoder);

  return {
    async load(url, onProgress) {
      const [data] = await Promise.all([
        file.loadAsync(url, (event) => {
          onProgress?.(event.lengthComputable && event.total > 0 ? event.loaded / event.total : null);
        }),
        ktx2.init(),
      ]);
      return gltf.parseAsync(data as ArrayBuffer, LoaderUtils.extractUrlBase(url));
    },
    dispose() {
      ktx2.dispose();
    },
  };
}

function defaultParts(): LoaderParts {
  return {
    file: new FileLoader(),
    ktx2: new KTX2Loader(),
    gltf: new GLTFLoader(),
    meshoptDecoder: MeshoptDecoder,
  };
}
