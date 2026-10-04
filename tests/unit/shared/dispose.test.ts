import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  Texture,
} from 'three';
import { disposeObject3D } from '../../../src/shared/dispose';

const spy = (resource: { dispose(): void }) => vi.spyOn(resource, 'dispose');

describe('disposeObject3D', () => {
  it('disposes geometry and material of a mesh', () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const geometry = spy(mesh.geometry);
    const material = spy(mesh.material);

    disposeObject3D(mesh);

    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
  });

  it('disposes every texture held by a material (learnings: materials do not free their textures)', () => {
    const map = new Texture();
    const normalMap = new Texture();
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map, normalMap }));
    const mapSpy = spy(map);
    const normalSpy = spy(normalMap);

    disposeObject3D(mesh);

    expect(mapSpy).toHaveBeenCalledOnce();
    expect(normalSpy).toHaveBeenCalledOnce();
  });

  it('disposes textures in ShaderMaterial uniforms', () => {
    const tex = new Texture();
    const material = new ShaderMaterial({ uniforms: { uTex: { value: tex }, uScale: { value: 2 } } });
    const texSpy = spy(tex);

    disposeObject3D(new Mesh(new BoxGeometry(), material));

    expect(texSpy).toHaveBeenCalledOnce();
  });

  it('handles material arrays', () => {
    const materials = [new MeshBasicMaterial(), new MeshBasicMaterial()];
    const spies = materials.map(spy);

    disposeObject3D(new Mesh(new BoxGeometry(), materials));

    spies.forEach((s) => expect(s).toHaveBeenCalledOnce());
  });

  it('traverses nested children including lines and points', () => {
    const root = new Group();
    const inner = new Group();
    const line = new Line(new BufferGeometry(), new LineBasicMaterial());
    const points = new Points(new BufferGeometry(), new PointsMaterial());
    inner.add(line, points);
    root.add(inner);
    const lineSpy = spy(line.geometry);
    const pointsSpy = spy(points.material);

    disposeObject3D(root);

    expect(lineSpy).toHaveBeenCalledOnce();
    expect(pointsSpy).toHaveBeenCalledOnce();
  });

  it('disposes shared geometry, material and texture only once', () => {
    const geometry = new BoxGeometry();
    const map = new Texture();
    const material = new MeshStandardMaterial({ map });
    const root = new Group();
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const spies = [spy(geometry), spy(material), spy(map)];

    disposeObject3D(root);

    spies.forEach((s) => expect(s).toHaveBeenCalledOnce());
  });

  it('disposes scene background and environment textures', () => {
    const scene = new Scene();
    scene.background = new Texture();
    scene.environment = new Texture();
    const spies = [spy(scene.background), spy(scene.environment)];

    disposeObject3D(scene);

    spies.forEach((s) => expect(s).toHaveBeenCalledOnce());
  });
});
