import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showContextLost } from '../../../src/ui/context-lost';

describe('showContextLost (spec 005, AC-6, AC-7)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('adds one accessible alert with a heading, an explanation and a Reload button', () => {
    showContextLost(container, () => {});

    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    const alert = alerts[0]!;
    expect(alert.classList.contains('context-lost')).toBe(true);
    expect(alert.querySelector('h2')?.textContent).toBe('The 3D view stopped');
    expect(alert.querySelector('p')?.textContent).toContain('graphics were interrupted');
    const button = alert.querySelector('button');
    expect(button?.textContent).toBe('Reload');
    expect(button?.type).toBe('button');
  });

  it('calls onReload when the button is activated', () => {
    const onReload = vi.fn();
    showContextLost(container, onReload);
    container.querySelector('button')?.click();
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('returns a function that removes the panel', () => {
    const remove = showContextLost(container, () => {});
    remove();
    expect(container.querySelector('.context-lost')).toBeNull();
  });

  it('replaces an existing panel rather than adding a second', () => {
    showContextLost(container, () => {});
    showContextLost(container, () => {});
    expect(container.querySelectorAll('.context-lost')).toHaveLength(1);
  });

  it('leaves other content alone', () => {
    const other = document.createElement('canvas');
    container.append(other);
    const remove = showContextLost(container, () => {});
    remove();
    expect(container.contains(other)).toBe(true);
  });
});
