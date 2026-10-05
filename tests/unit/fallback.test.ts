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

  it('has a single level-1 heading (spec 005, AC-4)', () => {
    const container = document.createElement('div');
    renderWebGLFallback(container, document.createElement('div'));
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('marks the status element with data-webgl="unavailable" (spec 005, AC-3)', () => {
    const status = document.createElement('div');
    renderWebGLFallback(document.createElement('div'), status);
    expect(status.dataset.webgl).toBe('unavailable');
  });

  it('defaults the status element to <body>', () => {
    delete document.body.dataset.webgl;
    renderWebGLFallback(document.createElement('div'));
    expect(document.body.dataset.webgl).toBe('unavailable');
    delete document.body.dataset.webgl;
  });
});
