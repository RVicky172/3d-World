import { Matrix4, Vector3, type Camera, type Object3D } from 'three';
import type { CameraControls } from '../controls/types';
import { createOcclusion } from './occlusion';
import { toScreen, type ScreenPoint } from './projection';
import type { HotspotConfig } from './types';

export type { HotspotConfig } from './types';

/** From a marker's centre to the near edge of its annotation, in CSS px (half the 44 px target, plus a gap). */
const ANNOTATION_GAP = 28;
/** The annotation keeps this far from the viewport's edges, in CSS px. */
const EDGE = 8;

let layers = 0;

export interface HotspotsOptions {
  /** The Space's overlay; the layer is appended, so create it before the controls (Tab order, AC-4). */
  overlay: HTMLElement;
  /** The 3D view: takes focus when the focused marker dims or hides (never lost, 004 AC-13). */
  canvas: HTMLElement;
  signal: AbortSignal;
  camera: Camera;
  /** The model the points belong to: their coordinates are its own, and it hides them (occlusion). */
  model: Object3D;
  hotspots: readonly HotspotConfig[];
  /** How far short of a point an occlusion ray stops, in world units (the plan's 0.01 r). */
  epsilon: number;
  controls: Pick<CameraControls, 'turnTo' | 'holdTurntable'>;
}

export interface Hotspots {
  /** Call once per frame, after the controls moved the camera, with the frame's delta. */
  update(deltaSeconds: number): void;
  /** The canvas's CSS size. */
  resize(width: number, height: number): void;
  /** World positions in data order (test seam for spec 012, AC-6). */
  positions(): Array<{ id: string; world: [number, number, number] }>;
  dispose(): void;
}

interface MarkerState {
  transform: string;
  hidden: boolean;
  dimmed: boolean;
}

/**
 * Markers over points on a model, each opening a short annotation (spec 012, AC-5–AC-12). Markers are buttons
 * in a `.hotspots` layer that lets drags through to the 3D view between them (AC-11). Each frame reads every
 * projected point first, then writes only what changed (NFR), and does nothing at all while the camera, the
 * size and the occlusion stay the same. Points the model hides are dimmed and disabled (AC-7), points behind
 * the camera hidden. Opening a marker turns the camera to its view and holds the turntable until it closes
 * (AC-9, AC-12); one annotation at a time, in a polite live region (AC-8).
 */
export function createHotspots(options: HotspotsOptions): Hotspots {
  const { overlay, canvas, camera, model, hotspots, controls } = options;
  const prefix = `hotspots-${++layers}`;
  const listeners = new AbortController();
  const { signal } = listeners;
  options.signal.addEventListener('abort', () => listeners.abort(), { once: true, signal });

  model.updateMatrixWorld(true);
  const worlds = hotspots.map((h) => model.localToWorld(new Vector3(...h.position)));
  const views = hotspots.map((h) => new Vector3(...h.view).transformDirection(model.matrixWorld).toArray());
  const occlusion = createOcclusion(model, { epsilon: options.epsilon });

  const layer = document.createElement('div');
  layer.className = 'hotspots';

  // The live region is always present (and empty while closed), so filling it is announced.
  const live = document.createElement('div');
  live.id = `${prefix}-annotation`;
  live.setAttribute('aria-live', 'polite');
  const annotation = document.createElement('section');
  annotation.className = 'hotspot-annotation';
  const heading = document.createElement('h3');
  heading.id = `${prefix}-title`;
  annotation.setAttribute('aria-labelledby', heading.id);
  const text = document.createElement('p');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  annotation.append(heading, text, close);

  const markers = hotspots.map((hotspot, i) => {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'hotspot';
    marker.setAttribute('aria-label', `Hotspot: ${hotspot.title}`);
    marker.setAttribute('aria-expanded', 'false');
    marker.setAttribute('aria-controls', live.id);
    const dot = document.createElement('span');
    dot.className = 'hotspot-dot';
    dot.setAttribute('aria-hidden', 'true');
    marker.append(dot);
    marker.addEventListener('click', () => (open === i ? closeAnnotation() : openAnnotation(i)), { signal });
    return marker;
  });
  const states: MarkerState[] = markers.map(() => ({ transform: '', hidden: false, dimmed: false }));

  close.addEventListener('click', () => closeAnnotation(), { signal });
  layer.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && open >= 0) closeAnnotation();
    },
    { signal },
  );

  layer.append(...markers, live);
  overlay.append(layer);

  let width = 0;
  let height = 0;
  let open = -1;
  let annotationSize = { width: 0, height: 0 };
  let points: ScreenPoint[] = [];
  let stale = true; // size or annotation changed since the last write
  let drawnOnce = false;
  const lastView = new Matrix4();
  const lastProjection = new Matrix4();
  let disposed = false;

  const usable = (i: number) => !states[i]!.hidden && !states[i]!.dimmed;

  function openAnnotation(i: number): void {
    const switching = open >= 0;
    if (switching) markers[open]!.setAttribute('aria-expanded', 'false');
    open = i;
    markers[i]!.setAttribute('aria-expanded', 'true');
    heading.textContent = hotspots[i]!.title;
    text.textContent = hotspots[i]!.text;
    if (!annotation.isConnected) live.append(annotation);
    annotationSize = { width: annotation.offsetWidth, height: annotation.offsetHeight }; // one read per open
    const point = points[i];
    if (point) placeAnnotation(point);
    stale = true;
    controls.turnTo(views[i]!);
    if (!switching) controls.holdTurntable(true);
  }

  function closeAnnotation(): void {
    if (open < 0) return;
    const marker = markers[open]!;
    const wasUsable = usable(open);
    marker.setAttribute('aria-expanded', 'false');
    open = -1;
    annotation.remove();
    controls.holdTurntable(false);
    (wasUsable ? marker : canvas).focus();
  }

  /**
   * Beside its marker (right if it fits, else left). On screens too narrow for either side, below it (else
   * above), so it never covers the marker. Clamped inside the viewport.
   */
  function placeAnnotation(point: ScreenPoint): void {
    const { width: w, height: h } = annotationSize;
    const clamp = (value: number, max: number) => Math.max(EDGE, Math.min(value, max));
    const right = point.x + ANNOTATION_GAP;
    const left = point.x - ANNOTATION_GAP - w;
    let x: number;
    let y: number;
    if (right + w <= width - EDGE || left >= EDGE) {
      x = right + w <= width - EDGE ? right : left;
      y = point.y - h / 2;
    } else {
      x = point.x - w / 2;
      const below = point.y + ANNOTATION_GAP;
      y = below + h <= height - EDGE ? below : point.y - ANNOTATION_GAP - h;
    }
    x = clamp(x, width - w - EDGE);
    y = clamp(y, height - h - EDGE);
    annotation.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    annotation.style.visibility = point.visible ? '' : 'hidden';
  }

  return {
    update(delta) {
      if (disposed || width === 0 || height === 0) return;
      camera.updateMatrixWorld(); // the controls moved it this frame; the engine renders after us
      const occlusionChanged = occlusion.update(delta, camera, worlds);
      const cameraChanged =
        !drawnOnce || !camera.matrixWorld.equals(lastView) || !camera.projectionMatrix.equals(lastProjection);
      if (!cameraChanged && !occlusionChanged && !stale) return;
      drawnOnce = true;
      stale = false;
      lastView.copy(camera.matrixWorld);
      lastProjection.copy(camera.projectionMatrix);

      // Read phase: every projection first…
      points = worlds.map((world) => toScreen(world, camera, width, height));

      // …then write phase: only what changed.
      markers.forEach((marker, i) => {
        const point = points[i]!;
        const state = states[i]!;
        const hidden = !point.visible;
        const dimmed = occlusion.occluded(i);
        if ((hidden || dimmed) && document.activeElement === marker) canvas.focus();
        if (hidden !== state.hidden) marker.hidden = state.hidden = hidden;
        if (dimmed !== state.dimmed) {
          marker.disabled = state.dimmed = dimmed;
          marker.classList.toggle('is-dimmed', dimmed);
        }
        const transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px)`;
        if (!hidden && transform !== state.transform) marker.style.transform = state.transform = transform;
      });
      if (open >= 0) placeAnnotation(points[open]!);
    },
    resize(w, h) {
      width = w;
      height = h;
      stale = true;
    },
    positions: () => hotspots.map((h, i) => ({ id: h.id, world: worlds[i]!.toArray() })),
    dispose() {
      disposed = true;
      occlusion.dispose();
      listeners.abort();
      layer.remove();
    },
  };
}
