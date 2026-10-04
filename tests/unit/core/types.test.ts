import { describe, expectTypeOf, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import type {
  OpenResult,
  RendererLike,
  SpaceContext,
  SpaceFactory,
  SpaceInstance,
  SpaceMeta,
} from '../../../src/core/types';

// Compile-time checks of the Space contract (AC-1, AC-11). `npm run typecheck` is the real gate.
describe('Space contract types', () => {
  it('accepts an instance without a custom render()', () => {
    const instance: SpaceInstance = {
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      update: (_delta: number, _elapsed: number) => {},
      resize: (_w: number, _h: number) => {},
      dispose: () => {},
    };
    expectTypeOf(instance.render).toEqualTypeOf<(() => void) | undefined>();
  });

  it('accepts an instance with an opt-in render() hook (AC-11)', () => {
    const instance: SpaceInstance = {
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      update: () => {},
      resize: () => {},
      render: () => {},
      dispose: () => {},
    };
    expectTypeOf(instance).toExtend<SpaceInstance>();
  });

  it('types the factory and lazy-loading metadata', () => {
    const factory: SpaceFactory = async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<SpaceContext>();
      expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>();
      return { scene: new Scene(), camera: new PerspectiveCamera(), update() {}, resize() {}, dispose() {} };
    };
    const meta: SpaceMeta = {
      id: 'demo',
      title: 'Demo',
      description: 'A demo space',
      kind: 'single',
      load: async () => ({ default: factory }),
    };
    expectTypeOf(meta.kind).toEqualTypeOf<'single' | 'multi'>();
    expectTypeOf(meta.load).returns.resolves.toEqualTypeOf<{ default: SpaceFactory }>();
  });

  it('lets a real WebGLRenderer satisfy RendererLike', () => {
    expectTypeOf<WebGLRenderer>().toExtend<RendererLike>();
  });

  it('enumerates open results', () => {
    expectTypeOf<OpenResult>().toEqualTypeOf<'opened' | 'not-found' | 'load-error' | 'superseded'>();
  });
});
