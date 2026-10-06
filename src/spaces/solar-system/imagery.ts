import { RepeatWrapping, type Texture } from 'three';
import type { Ktx2 } from '../../shared/ktx2';
import type { BodyData, Imagery } from './types';

/**
 * The Solar System's imagery (spec 022, AC-11/AC-12, plan §3): loaded after the Space has opened in its plain
 * colours. Each texture is handed to its body and layer as it arrives; progress is bytes loaded over the total; a
 * failure leaves that body coloured; an abort (leaving, a context loss) disposes whatever arrives late.
 */

export type ImageryLayer = 'surface' | 'clouds' | 'night' | 'ocean' | 'rings';

export interface ImageryJob {
  id: string;
  layer: ImageryLayer;
  file: string;
  bytes: number;
  /** Null for the ring profile, a radial strip with no longitude. */
  leftEdgeLongitudeDeg: number | null;
}

/** Every file to load, in data order: each body's surface, then Earth's layers and Saturn's ring profile. */
export function imageryJobs(bodies: readonly BodyData[]): ImageryJob[] {
  const job = (id: string, layer: ImageryLayer, imagery: Imagery, longitude = true): ImageryJob => ({
    id,
    layer,
    file: imagery.file,
    bytes: imagery.bytes,
    leftEdgeLongitudeDeg: longitude ? imagery.leftEdgeLongitudeDeg : null,
  });
  return bodies.flatMap((body) => [
    job(body.id, 'surface', body.imagery),
    ...(body.layers
      ? [
          job(body.id, 'clouds', body.layers.clouds),
          job(body.id, 'night', body.layers.night),
          job(body.id, 'ocean', body.layers.ocean),
        ]
      : []),
    ...(body.rings ? [job(body.id, 'rings', body.rings.profile, false)] : []),
  ]);
}

/**
 * Puts the map's 0° longitude on the prime meridian: `SphereGeometry` shows map u at longitude 360 (u − 0.5)
 * (surfaces.ts), so a map whose left edge is at L needs u shifted by −(L + 180) / 360. The fetch script's maps
 * (0° at the centre) need none.
 */
function alignLongitude(texture: Texture, leftEdgeLongitudeDeg: number): void {
  const offset = -(leftEdgeLongitudeDeg + 180) / 360;
  if (offset === 0) return;
  texture.offset.x = offset;
  texture.wrapS = RepeatWrapping;
}

export interface ImageryOptions {
  bodies: readonly BodyData[];
  /** Where the files live: `<BASE_URL>assets/solar-system/`. */
  baseUrl: string;
  /** Owned from here on: freed once every load has settled. */
  loader: Ktx2;
  signal: AbortSignal;
  /** May throw (the body is gone): the texture is then disposed and counted as failed. */
  onTexture(id: string, layer: ImageryLayer, texture: Texture): void;
  /** 0–1, rising; exactly 1 once, when everything has settled. Not called after an abort. */
  onProgress(fraction: number): void;
}

/** Loads every map. Resolves (never rejects) with the `id:layer` of each that failed; empty after an abort. */
export async function loadImagery(options: ImageryOptions): Promise<{ failed: string[] }> {
  const { loader, signal } = options;
  if (signal.aborted) {
    loader.dispose();
    return { failed: [] };
  }
  const jobs = imageryJobs(options.bodies);
  const total = jobs.reduce((sum, j) => sum + j.bytes, 0);
  const loaded = jobs.map(() => 0);
  let sum = 0;
  const report = (index: number, bytes: number) => {
    const next = Math.min(bytes, jobs[index]!.bytes);
    if (next <= loaded[index]! || signal.aborted) return;
    sum += next - loaded[index]!;
    loaded[index] = next;
    if (sum < total) options.onProgress(sum / total);
  };

  const failed: string[] = [];
  await Promise.all(
    jobs.map(async (job, index) => {
      try {
        const texture = await loader.load(options.baseUrl + job.file, (bytes) => report(index, bytes));
        if (signal.aborted) {
          texture.dispose();
          return;
        }
        try {
          if (job.leftEdgeLongitudeDeg !== null) alignLongitude(texture, job.leftEdgeLongitudeDeg);
          options.onTexture(job.id, job.layer, texture);
        } catch (error) {
          texture.dispose();
          throw error;
        }
      } catch {
        if (!signal.aborted) failed.push(`${job.id}:${job.layer}`);
      } finally {
        report(index, job.bytes);
      }
    }),
  );
  loader.dispose();

  if (signal.aborted) return { failed: [] };
  failed.sort();
  if (failed.length)
    console.warn(`Solar System: imagery failed to load, kept plain colours: ${failed.join(', ')}`);
  options.onProgress(1);
  return { failed };
}

/** How long an arriving image takes to fade in from the body's colour, in Space time. */
export const FADE_SECONDS = 0.5;

export interface Fader {
  /** Starts a fade: `apply` gets 0 now, then rising values each `advance`, ending at 1. */
  add(apply: (mix: number) => void): void;
  /** Advances every fade by the frame's `delta` (seconds). */
  advance(deltaSeconds: number): void;
  /** Drops every fade in progress. */
  clear(): void;
  /** Fades in progress. */
  readonly active: number;
}

/** Fades driven by `update()`'s delta, never the clock; under reduced motion each image shows at once. */
export function createFader(reducedMotion: boolean): Fader {
  let fades: { apply: (mix: number) => void; elapsed: number }[] = [];
  return {
    add(apply) {
      if (reducedMotion) {
        apply(1);
        return;
      }
      apply(0);
      fades.push({ apply, elapsed: 0 });
    },
    advance(deltaSeconds) {
      if (!fades.length) return;
      for (const fade of fades) {
        fade.elapsed += deltaSeconds;
        fade.apply(Math.min(1, fade.elapsed / FADE_SECONDS));
      }
      fades = fades.filter((fade) => fade.elapsed < FADE_SECONDS);
    },
    clear() {
      fades = [];
    },
    get active() {
      return fades.length;
    },
  };
}
