/** Half of the 44 × 44 CSS px target every body gets, however small it is drawn (spec 023, AC-1). */
export const PICK_RADIUS = 22;

/** A body as drawn on screen this frame (CSS px). */
export interface Pickable {
  id: string;
  x: number;
  y: number;
  /** The disc's radius on screen. */
  radiusPx: number;
  /** Distance from the camera: the nearer of two overlapping discs wins. */
  depth: number;
  /** False when it isn't drawn as a target (behind the camera, a moon tucked into its planet). */
  visible: boolean;
  /** Its shown name's box [left, top, right, bottom], or null if its name is hidden. */
  nameBox: readonly [number, number, number, number] | null;
}

/**
 * The body a click at (x, y) selects (spec 023, AC-1, plan §1), or null. Inside one or more real discs, the
 * nearest to the camera wins. Otherwise the reachable body nearest the pointer wins: within `reach` px of its
 * centre (or its disc, if larger), or anywhere on its shown name (which counts as distance 0).
 */
export function pick(items: readonly Pickable[], x: number, y: number, reach = PICK_RADIUS): string | null {
  let disc: Pickable | null = null;
  let near: Pickable | null = null;
  let nearDistance = Infinity;
  for (const item of items) {
    if (!item.visible) continue;
    const distance = Math.hypot(item.x - x, item.y - y);
    if (distance <= item.radiusPx && (!disc || item.depth < disc.depth)) disc = item;
    const box = item.nameBox;
    const onName = box !== null && x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
    const score = onName ? 0 : distance <= Math.max(reach, item.radiusPx) ? distance : Infinity;
    if (score < nearDistance) {
      near = item;
      nearDistance = score;
    }
  }
  return (disc ?? near)?.id ?? null;
}
