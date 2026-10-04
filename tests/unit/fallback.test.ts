import { describe, expect, it } from 'vitest';
import { renderWebGLFallback } from '../../src/ui/fallback';

describe('renderWebGLFallback', () => {
  it('replaces container content with an accessible alert', () => {
    const container = document.createElement('div');
    container.innerHTML = '<canvas></canvas>';

    renderWebGLFallback(container);

    expect(container.querySelector('canvas')).toBeNull();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('WebGL2 is not available');
  });
});
