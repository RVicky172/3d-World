import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Texture,
  Vector3,
  type Object3D,
} from 'three';
import type { SpaceContext, SpaceInstance } from '../../../../src/core/types';
import { createModelViewer, type ModelViewerDeps } from '../../../../src/shared/model-viewer';
import type { ModelLoader } from '../../../../src/shared/model-viewer/loader';
import { frameDistance } from '../../../../src/shared/model-viewer/framing';
import type { ModelViewerConfig } from '../../../../src/shared/model-viewer/types';
import { toScreen } from '../../../../src/shared/hotspots/projection';
import type { HotspotConfig } from '../../../../src/shared/hotspots/types';
import { createFakeContext } from '../../../helpers/fakes';

const CONFIG: ModelViewerConfig = {
  title: 'Test Chair',
  model: { path: 'assets/test/chair.glb' },
  camera: { fov: 50, direction: [0, 0, 1] },
  turntable: { speed: 2, idleDelay: 4 },
  assets: [
    {
      path: 'assets/test/chair.glb',
      title: 'Chair',
      author: 'A. Maker',
      license: 'CC0-1.0',
      source: 'https://example.org/chair',
    },
  ],
};
const FOV = (50 * Math.PI) / 180;
const RADIUS = 3; // half the diagonal of a 2 × 4 × 4 box

/** An off-centre textured box standing in for a loaded glTF scene. */
function createModel() {
  const map = new Texture();
  const material = new MeshStandardMaterial({ map });
  const geometry = new BoxGeometry(2, 4, 4);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(5, -3, 1);
  const group = new Group();
  group.add(mesh);
  return { group, map, material, geometry };
}

describe('createModelViewer (spec 010)', () => {
  let ctx: SpaceContext;
  let model: ReturnType<typeof createModel>;
  let environment: Texture;
  let deps: Required<Pick<ModelViewerDeps, 'createLoader' | 'createEnvironment' | 'baseUrl'>>;
  let loader: {
    load: ReturnType<typeof vi.fn<ModelLoader['load']>>;
    dispose: ReturnType<typeof vi.fn<() => void>>;
  };
  let viewer: SpaceInstance;

  beforeEach(() => {
    ctx = createFakeContext();
    document.body.append(ctx.canvas, ctx.overlay);
    model = createModel();
    environment = new Texture();
    loader = {
      load: vi.fn<ModelLoader['load']>(async () => ({ scene: model.group as Object3D })),
      dispose: vi.fn<() => void>(),
    };
    deps = {
      createLoader: vi.fn(() => loader),
      createEnvironment: vi.fn(() => environment),
      baseUrl: '/base/',
    };
  });

  afterEach(() => {
    ctx.canvas.remove();
    ctx.overlay.remove();
  });

  const open = async (config = CONFIG) => {
    viewer = await createModelViewer(ctx, config, deps);
    return viewer;
  };
  const camera = () => viewer.camera as PerspectiveCamera;
  const distance = () => camera().position.length();
  const direction = () => camera().position.clone().normalize();
  const press = (key: string) =>
    ctx.canvas.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  describe('opening', () => {
    it('loads the model from the site base URL', async () => {
      await open();
      expect(deps.createLoader).toHaveBeenCalledWith(ctx.renderer);
      expect(loader.load.mock.calls[0]?.[0]).toBe('/base/assets/test/chair.glb');
    });

    it('passes download progress to the loading indicator (spec 011, AC-8)', async () => {
      const reported: Array<number | null> = [];
      ctx.reportProgress = (fraction) => reported.push(fraction);
      loader.load.mockImplementationOnce(async (_url, onProgress) => {
        onProgress?.(0.5);
        onProgress?.(null);
        return { scene: model.group };
      });
      await open();
      expect(reported).toEqual([0.5, null]);
    });

    it('frees the loader (and its decoder workers) as soon as the model has loaded (spec 011, AC-13)', async () => {
      await open();
      expect(loader.dispose).toHaveBeenCalledTimes(1);
    });

    it('centres the model on the origin (the controls focus point)', async () => {
      await open();
      const center = new Box3().setFromObject(viewer.scene).getCenter(new Vector3());
      expect(center.length()).toBeCloseTo(0, 9);
    });

    it('lights the model with the generated environment and keeps the site background', async () => {
      await open();
      expect(deps.createEnvironment).toHaveBeenCalledWith(ctx.renderer);
      expect(viewer.scene.environment).toBe(environment);
      expect(viewer.scene.background).toBeNull();
    });

    it('frames the model from the configured direction once sized (AC-2)', async () => {
      await open({ ...CONFIG, camera: { fov: 50, direction: [0, 3, 4] } });
      viewer.resize(1280, 720);
      expect(distance()).toBeCloseTo(frameDistance(RADIUS, FOV, 1280 / 720, 0.75), 6);
      expect(direction().toArray()).toEqual([0, 0.6, 0.8].map((v) => expect.closeTo(v, 6)));
      expect(camera().near).toBeCloseTo(RADIUS / 100, 9);
      expect(camera().far).toBeCloseTo(RADIUS * 100, 9);
    });

    it('names the model in the 3D view’s accessible label (AC-7)', async () => {
      await open();
      expect(ctx.canvas.getAttribute('aria-label')).toContain('Test Chair');
    });

    it('shows a credit line with title, author, licence and a link to the source (AC-13)', async () => {
      await open();
      const credit = ctx.overlay.querySelector('.model-credit');
      expect(credit?.textContent).toContain('Chair');
      expect(credit?.textContent).toContain('A. Maker');
      expect(credit?.textContent).toContain('CC0 1.0');
      expect(credit?.querySelector('a')?.getAttribute('href')).toBe('https://example.org/chair');
    });
  });

  describe('re-framing on resize (AC-3)', () => {
    it('re-frames for the new size while the visitor has not moved the camera', async () => {
      await open();
      viewer.resize(1280, 720);
      viewer.resize(320, 640);
      expect(distance()).toBeCloseTo(frameDistance(RADIUS, FOV, 0.5, 0.75), 6);
    });

    it('keeps the turntable’s current angle when re-framing', async () => {
      await open();
      viewer.resize(1280, 720);
      for (let i = 0; i < 60; i++) viewer.update(1 / 60, i / 60);
      const turned = direction();
      expect(turned.angleTo(new Vector3(0, 0, 1))).toBeGreaterThan((3 * Math.PI) / 180); // the turntable moved it

      viewer.resize(320, 640);
      // Same angle, not back to the home direction; damping inertia in flight may add a fraction of a degree.
      expect(direction().angleTo(turned)).toBeLessThan((1 * Math.PI) / 180);
      expect(direction().angleTo(new Vector3(0, 0, 1))).toBeGreaterThan((2 * Math.PI) / 180);
    });

    it('leaves a camera the visitor moved alone, but Reset frames for the current size', async () => {
      await open();
      viewer.resize(1280, 720);
      press('ArrowLeft');
      const moved = camera().position.clone();

      viewer.resize(320, 640);
      expect(camera().position.distanceTo(moved)).toBeLessThan(1e-9);

      press('r');
      expect(distance()).toBeCloseTo(frameDistance(RADIUS, FOV, 0.5, 0.75), 6);
      expect(direction().toArray()).toEqual([0, 0, 1].map((v) => expect.closeTo(v, 6)));
    });
  });

  describe('hotspots (spec 012)', () => {
    // The box is 2 × 4 × 4 centred at (5, −3, 1) in the model's own coordinates: its front face is at z = 3.
    const FRONT: HotspotConfig = {
      id: 'front',
      title: 'Front',
      text: 'The front face.',
      position: [5, -3, 3],
      view: [1, 0, 1],
    };
    const WITH_HOTSPOTS: ModelViewerConfig = { ...CONFIG, hotspots: [FRONT] };
    const layer = () => ctx.overlay.querySelector('.hotspots');
    const marker = () => ctx.overlay.querySelector<HTMLButtonElement>('button.hotspot')!;
    const translation = () => {
      const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(marker().style.transform);
      return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
    };

    it('adds the markers before the controls bar, so they come first in Tab order (AC-10, plan)', async () => {
      await open(WITH_HOTSPOTS);
      const bar = ctx.overlay.querySelector('.controls-bar')!;
      expect(layer()).not.toBeNull();
      expect(layer()!.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(marker().getAttribute('aria-label')).toBe('Hotspot: Front');
    });

    it('reports world positions that include the model’s centring (AC-6 seam)', async () => {
      await open(WITH_HOTSPOTS);
      const [front] = viewer.hotspotPositions!();
      expect(front?.id).toBe('front');
      front?.world.forEach((c, i) => expect(c).toBeCloseTo([0, 0, 2][i]!, 9));
    });

    it('places markers from the camera as the controls left it this frame (AC-6)', async () => {
      await open(WITH_HOTSPOTS);
      viewer.resize(800, 600);
      viewer.update(1 / 60, 0);
      // The turntable turns the camera inside controls.update(): 0.5 s of it moves the point visibly.
      viewer.update(0.5, 0.5);
      camera().updateMatrixWorld();
      const expected = toScreen(new Vector3(0, 0, 2), camera(), 800, 600);
      expect(translation()?.x).toBeCloseTo(expected.x, 0);
      expect(translation()?.y).toBeCloseTo(expected.y, 0);
    });

    it('activating a marker turns the camera to its view (AC-9)', async () => {
      await open(WITH_HOTSPOTS);
      viewer.resize(800, 600);
      viewer.update(1 / 60, 0);
      marker().click();
      for (let i = 1; i <= 60; i++) viewer.update(1 / 60, i / 60);
      expect(direction().angleTo(new Vector3(1, 0, 1).normalize())).toBeLessThan(0.01);
    });

    it('dispose() removes the markers (AC-15)', async () => {
      await open(WITH_HOTSPOTS);
      viewer.dispose();
      expect(layer()).toBeNull();
    });

    it('a model without hotspots gets no layer and no positions (AC-14)', async () => {
      await open();
      expect(layer()).toBeNull();
      expect(viewer.hotspotPositions?.() ?? []).toEqual([]);
    });
  });

  describe('disposal (AC-10)', () => {
    it('frees geometry, material, textures and the environment, and removes its DOM', async () => {
      const spies = [model.geometry, model.material, model.map, environment].map((resource) =>
        vi.spyOn(resource, 'dispose'),
      );
      await open();

      viewer.dispose();

      spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
      expect(ctx.overlay.querySelector('.model-credit')).toBeNull();
      expect(ctx.canvas.hasAttribute('aria-label')).toBe(false);
    });
  });

  describe('failure (AC-9)', () => {
    it('rejects when the model cannot be loaded, having allocated nothing', async () => {
      loader.load.mockRejectedValueOnce(new Error('404'));

      await expect(open()).rejects.toThrow('404');
      expect(loader.dispose).toHaveBeenCalledTimes(1);
      expect(deps.createEnvironment).not.toHaveBeenCalled();
      expect(ctx.overlay.childElementCount).toBe(0);
      expect(ctx.canvas.hasAttribute('tabindex')).toBe(false);
    });

    it('rejects the same way when a decoder cannot be readied (spec 011, AC-12)', async () => {
      loader.load.mockRejectedValueOnce(new Error('basis_transcoder.wasm 404'));

      await expect(open()).rejects.toThrow('basis_transcoder.wasm 404');
      expect(loader.dispose).toHaveBeenCalledTimes(1);
      expect(deps.createEnvironment).not.toHaveBeenCalled();
      expect(ctx.overlay.childElementCount).toBe(0);
    });
  });
});
