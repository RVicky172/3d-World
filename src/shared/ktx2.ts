import type { CompressedTexture, WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/** The parts of three's `KTX2Loader` used here; replaced by fakes in unit tests. */
export type Ktx2LoaderLike = Pick<
  KTX2Loader,
  'setWorkerLimit' | 'detectSupport' | 'init' | 'dispose' | 'loadAsync'
>;

/** Loads standalone `.ktx2` textures (spec 022) and frees the transcoder when done. */
export interface Ktx2 {
  /** Rejects if the transcoder can't start or the file can't load. `onBytes` gets the bytes loaded so far. */
  load(url: string, onBytes?: (loaded: number) => void): Promise<CompressedTexture>;
  /** Frees the transcoder's workers. Call it once loading has settled (or is abandoned). */
  dispose(): void;
}

/** A few textures at a time; each worker holds its own copy of the transcoder. */
const TRANSCODER_WORKERS = 2;

/**
 * Sizes a KTX2 loader for this GPU (specs 011, 022). The transcoder path is left unset: three finds
 * `basis_transcoder.js/.wasm` relative to its own module, and Vite self-hosts both as build assets.
 */
export function configureKtx2(
  loader: Pick<KTX2Loader, 'setWorkerLimit' | 'detectSupport'>,
  renderer: WebGLRenderer,
) {
  loader.setWorkerLimit(TRANSCODER_WORKERS);
  loader.detectSupport(renderer);
}

/**
 * Standalone KTX2 textures (spec 022, the Solar System's imagery). The transcoder is readied once, before the
 * first download, so a transcoder failure rejects every load instead of yielding blank textures.
 */
export function createKtx2(renderer: WebGLRenderer, loader: Ktx2LoaderLike = new KTX2Loader()): Ktx2 {
  configureKtx2(loader, renderer);
  let ready: Promise<void> | null = null;
  return {
    async load(url, onBytes) {
      ready ??= loader.init();
      await ready;
      return (await loader.loadAsync(url, (event) => onBytes?.(event.loaded))) as CompressedTexture;
    },
    dispose() {
      loader.dispose();
    },
  };
}
