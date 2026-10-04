import { Scene, Texture, type Material, type Mesh, type Object3D, type ShaderMaterial } from 'three';

interface Disposable {
  dispose(): void;
}

/**
 * Frees GPU resources under `root`: geometries, materials, and every texture a material
 * references (disposing a material does not free its textures). Shared resources are
 * disposed once. Does not remove `root` from its parent.
 */
export function disposeObject3D(root: Object3D): void {
  const done = new Set<Disposable>();
  const free = (resource: Disposable) => {
    if (done.has(resource)) return;
    done.add(resource);
    resource.dispose();
  };

  const freeMaterial = (material: Material) => {
    if (done.has(material)) return;
    for (const value of Object.values(material)) {
      if (value instanceof Texture) free(value);
    }
    const uniforms = (material as Partial<ShaderMaterial>).uniforms;
    if (uniforms) {
      for (const uniform of Object.values(uniforms)) {
        if (uniform?.value instanceof Texture) free(uniform.value);
      }
    }
    free(material);
  };

  if (root instanceof Scene) {
    if (root.background instanceof Texture) free(root.background);
    if (root.environment instanceof Texture) free(root.environment);
  }

  root.traverse((object) => {
    // Mesh, Line, Points, Sprite… all expose optional geometry/material the same way.
    const { geometry, material } = object as Partial<Mesh>;
    if (geometry) free(geometry);
    if (material) (Array.isArray(material) ? material : [material]).forEach(freeMaterial);
  });
}
