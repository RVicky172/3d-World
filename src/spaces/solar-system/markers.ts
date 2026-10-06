import { Matrix4, PerspectiveCamera, type Camera, type Vector3 } from 'three';
import { toScreen, type ScreenPoint } from '../../shared/hotspots/projection';
import { pick, type Pickable } from './picking';

/** A moon's marker shows only this far (CSS px) from its planet's, so the two never pile up (AC-8a). */
const MOON_CLEARANCE = 24;
/**
 * Name boxes for the declutter pass (D-024), CSS px. The name starts `offset` from the dot's centre (10 px of
 * padding minus the 3 px half-dot). Sizes are measured once whenever the markers are shown or resized; the
 * estimate (7 px per character, 15 px tall) is only for when nothing can be measured (jsdom). Names this close to
 * the right edge sit left of their dot.
 */
const LABEL = { offset: 7, charWidth: 7, height: 15, edge: 4 };
/**
 * D-037: a body drawn at least this big (radius, CSS px) shows its own disc, so its marker drops the dot and its
 * name moves out to `radius + DISC_GAP` from the centre. Smaller bodies keep 020's dot.
 */
const DISC_MIN_PX = 3;
const DISC_GAP = 4;

export interface BodyMarkers {
  /** Real scale shows the markers; stylised hides them. */
  setActive(active: boolean): void;
  /** The canvas's CSS size. */
  resize(width: number, height: number): void;
  /** Call once per frame, after the camera moved and its matrices are current. */
  update(): void;
  /** The bodies moved (spec 021): the next `update()` re-projects even if the camera didn't move. */
  invalidate(): void;
  /** The body whose projected centre is nearest (x, y) within `radius` CSS px, or null; null while inactive. */
  nearest(x: number, y: number, radius: number): string | null;
  /** Marks one body as selected (spec 023, AC-3): highlighted, and its name always shows. Null clears it. */
  setSelected(id: string | null): void;
  /**
   * The body a click at (x, y) selects (spec 023, AC-1): `pick()` over this frame's discs, centres and shown
   * names. Null while inactive. Call after `update()`.
   */
  hit(x: number, y: number): string | null;
  dispose(): void;
}

interface MarkerState {
  transform: string;
  hidden: boolean;
  named: boolean;
  left: boolean;
  /** Drawn as a disc (D-037): no dot, the name pushed out. */
  disc: boolean;
  /** The name's distance from the centre, whole CSS px. */
  offset: number;
  selected: boolean;
}

/**
 * Name markers (spec 020, AC-8a; both scales since 023, AC-14). Labels only: the layer is `aria-hidden` (the
 * scale description and 023's body list speak for them) and lets pointer events through; clicks reach the canvas,
 * which asks `hit()`. Each frame projects every body (read), then writes only what changed, and nothing at all
 * while the camera, the size and the state stay the same. A moon's marker hides while it is within 24 px of its
 * planet's. A body under 3 px keeps a dot with its name beside it; a larger one shows no dot and its name sits
 * just outside its disc (D-037).
 */
export function createBodyMarkers(options: {
  overlay: HTMLElement;
  camera: Camera;
  /** `size` (e.g. radius) decides who keeps its name when two would overlap: the larger body. */
  bodies: ReadonlyArray<{ id: string; name: string; parent: string | null; size: number }>;
  /** The body's current world position. */
  worldOf(id: string): Vector3;
  /** The body's drawn radius in world units (D-037). Without it every body counts as sub-pixel. */
  radiusOf?(id: string): number;
}): BodyMarkers {
  const { overlay, camera, bodies, worldOf, radiusOf } = options;
  const layer = document.createElement('div');
  layer.className = 'body-markers';
  layer.setAttribute('aria-hidden', 'true');
  const elements = bodies.map((body) => {
    const el = document.createElement('span');
    el.className = 'body-marker';
    el.dataset.body = body.id;
    // A real element (not ::before) so tests can measure where the dot is.
    const dot = document.createElement('span');
    dot.className = 'body-marker-dot';
    const name = document.createElement('span');
    name.className = 'body-marker-name';
    name.textContent = body.name;
    el.append(dot, name);
    return el;
  });
  const states: MarkerState[] = elements.map(() => ({
    transform: '',
    hidden: false,
    named: true,
    left: false,
    disc: false,
    offset: -1,
    selected: false,
  }));
  const names = elements.map((el) => el.querySelector<HTMLElement>('.body-marker-name')!);
  const estimate = (i: number) => ({ w: bodies[i]!.name.length * LABEL.charWidth, h: LABEL.height });
  let sizes = bodies.map((_, i) => estimate(i));
  let needsMeasure = true;
  /** Shows every name, then reads all their sizes in one go (one layout), once per show or resize. */
  const measure = () => {
    elements.forEach((el, i) => {
      el.hidden = false;
      names[i]!.hidden = false;
      states[i]!.hidden = false;
      states[i]!.named = true;
    });
    sizes = names.map((n, i) => (n.offsetWidth > 0 ? { w: n.offsetWidth, h: n.offsetHeight } : estimate(i)));
    needsMeasure = false;
  };
  /** Larger bodies first: they keep their names. */
  const bySize = bodies.map((_, i) => i).sort((a, b) => bodies[b]!.size - bodies[a]!.size);
  layer.append(...elements);
  overlay.append(layer);

  const index = new Map(bodies.map((b, i) => [b.id, i]));
  /** Moons are bodies whose parent has a parent of its own. */
  const planetOf = bodies.map((b) => {
    const parent = b.parent ? bodies[index.get(b.parent) ?? -1] : undefined;
    return parent?.parent ? index.get(parent.id)! : -1;
  });

  let active = false;
  let width = 0;
  let height = 0;
  let stale = true;
  let points: ScreenPoint[] = [];
  /** This frame's on-screen radii and camera distances, and the shown names' boxes (for `hit()`). */
  let radiiPx: number[] = bodies.map(() => 0);
  let depths: number[] = bodies.map(() => 0);
  const boxes: Array<[number, number, number, number] | null> = bodies.map(() => null);
  let selected = -1;
  const lastView = new Matrix4();
  const lastProjection = new Matrix4();
  let disposed = false;

  const setHidden = (el: HTMLElement, hidden: boolean) => {
    if (el.hidden !== hidden) el.hidden = hidden;
  };
  setHidden(layer, true);

  return {
    setActive(next) {
      if (next === active) return;
      active = next;
      stale = true;
      needsMeasure = true;
      setHidden(layer, !active);
    },
    resize(w, h) {
      width = w;
      height = h;
      stale = true;
      needsMeasure = true;
    },
    invalidate() {
      stale = true;
    },
    update() {
      if (disposed || !active || width === 0 || height === 0) return;
      if (!stale && camera.matrixWorld.equals(lastView) && camera.projectionMatrix.equals(lastProjection))
        return;
      stale = false;
      if (needsMeasure) measure();
      lastView.copy(camera.matrixWorld);
      lastProjection.copy(camera.projectionMatrix);

      // Read phase: every projection first…
      points = bodies.map((b) => toScreen(worldOf(b.id), camera, width, height));
      // On-screen radius: world radius × pixels per unit at the body's distance (a view offset keeps the scale).
      const perUnit =
        camera instanceof PerspectiveCamera ? height / 2 / Math.tan((camera.fov * Math.PI) / 360) : 0;
      depths = bodies.map((b) => camera.position.distanceTo(worldOf(b.id)));
      radiiPx = bodies.map((b, i) =>
        radiusOf ? (radiusOf(b.id) * perUnit) / Math.max(depths[i]!, 1e-12) : 0,
      );

      // …then write only what changed.
      elements.forEach((el, i) => {
        const point = points[i]!;
        const planet = planetOf[i]!;
        const crowded =
          planet >= 0 &&
          Math.hypot(point.x - points[planet]!.x, point.y - points[planet]!.y) < MOON_CLEARANCE;
        const hidden = !point.visible || crowded;
        const state = states[i]!;
        if (hidden !== state.hidden) setHidden(el, (state.hidden = hidden));
        const transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px)`;
        if (!hidden && transform !== state.transform) el.style.transform = state.transform = transform;
        const disc = radiiPx[i]! >= DISC_MIN_PX;
        if (disc !== state.disc) el.classList.toggle('is-disc', (state.disc = disc));
        const offset = disc ? Math.round(radiiPx[i]! + DISC_GAP) : LABEL.offset;
        if (offset !== state.offset) el.style.setProperty('--name-offset', `${(state.offset = offset)}px`);
        const isSelected = i === selected;
        if (isSelected !== state.selected) el.classList.toggle('is-selected', (state.selected = isSelected));
      });

      // Declutter (D-024): the selected body first (023), then by size; a name shows only if its box clears every
      // name already shown.
      const shown: Array<[number, number, number, number]> = [];
      const order = selected >= 0 ? [selected, ...bySize.filter((i) => i !== selected)] : bySize;
      for (const i of order) {
        const state = states[i]!;
        boxes[i] = null;
        if (state.hidden) continue;
        const { x, y } = points[i]!;
        const { w, h } = sizes[i]!;
        const offset = state.offset;
        const left = x + offset + w > width - LABEL.edge;
        const box: [number, number, number, number] = left
          ? [x - offset - w, y - h / 2, x - offset, y + h / 2]
          : [x + offset, y - h / 2, x + offset + w, y + h / 2];
        const named = !shown.some(
          ([x0, y0, x1, y1]) => box[0] < x1 && x0 < box[2] && box[1] < y1 && y0 < box[3],
        );
        if (named) {
          shown.push(box);
          boxes[i] = box;
        }
        if (named !== state.named) setHidden(names[i]!, !(state.named = named));
        if (left !== state.left) elements[i]!.classList.toggle('is-left', (state.left = left));
      }
    },
    nearest(x, y, radius) {
      if (!active) return null;
      let best: string | null = null;
      let bestDistance = radius;
      points.forEach((point, i) => {
        if (!point.visible) return;
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance <= bestDistance) {
          bestDistance = distance;
          best = bodies[i]!.id;
        }
      });
      return best;
    },
    setSelected(id) {
      const next = id === null ? -1 : (index.get(id) ?? -1);
      if (next === selected) return;
      selected = next;
      stale = true;
    },
    hit(x, y) {
      if (!active) return null;
      const items: Pickable[] = bodies.map((b, i) => ({
        id: b.id,
        x: points[i]?.x ?? 0,
        y: points[i]?.y ?? 0,
        radiusPx: radiiPx[i]!,
        depth: depths[i]!,
        visible: !!points[i]?.visible && !states[i]!.hidden,
        nameBox: boxes[i] ?? null,
      }));
      return pick(items, x, y);
    },
    dispose() {
      disposed = true;
      layer.remove();
    },
  };
}
