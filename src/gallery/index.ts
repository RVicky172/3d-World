import { PerspectiveCamera, Scene } from 'three';
import { formatRoute } from '../core/routes';
import type { SpaceFactory, SpaceMeta } from '../core/types';
import { disposeObject3D } from '../shared/dispose';
import { renderGallery } from './cards';
import { createStarfield } from './starfield';

export interface GalleryViewOptions {
  /** Registry metadata only: the gallery never imports Space modules (spec 003, AC-5). */
  spaces: readonly SpaceMeta[];
  /** Vite's BASE_URL, for thumbnail paths under a sub-path. */
  baseUrl: string;
}

/**
 * The gallery as a view: same contract as a Space, so the SpaceManager gives it fades, disposal
 * and supersession for free. Not in the registry: it is the home page, not a Space.
 */
export function createGalleryView({ spaces, baseUrl }: GalleryViewOptions): SpaceFactory {
  return async (ctx) => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 1, 0.1, 200);
    const starfield = createStarfield(ctx.reducedMotion);
    scene.add(starfield.object);

    const gallery = renderGallery(spaces, { baseUrl, signal: ctx.signal });
    ctx.overlay.append(gallery);

    return {
      scene,
      camera,
      update(_delta, elapsed) {
        starfield.update(elapsed);
      },
      focusTarget({ previousSpaceId }) {
        // Return keyboard users to the card they opened; else the heading (spec 004, AC-13).
        const href = previousSpaceId === null ? null : formatRoute({ name: 'space', id: previousSpaceId });
        const card = [...gallery.querySelectorAll<HTMLAnchorElement>('a.card')].find(
          (a) => a.getAttribute('href') === href,
        );
        return card ?? gallery.querySelector<HTMLElement>('h1');
      },
      resize(width, height) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      },
      dispose() {
        gallery.remove();
        disposeObject3D(scene);
      },
    };
  };
}
