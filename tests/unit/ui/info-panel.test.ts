import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInfoPanel } from '../../../src/ui/info-panel';

// Spec 012: every Space shows its title and description (AC-1) in a collapsible, accessible panel (AC-2, AC-4).

const INFO = { title: 'Sheen Chair', description: 'A velvet armchair to turn, zoom and inspect.' };

describe('createInfoPanel', () => {
  let overlay: HTMLElement;

  beforeEach(() => {
    overlay = document.createElement('div');
    overlay.append(document.createElement('canvas-ui')); // the Space's own UI, already there
    document.body.replaceChildren(overlay);
  });

  const toggle = () => overlay.querySelector<HTMLButtonElement>('button.info-toggle')!;
  const region = () => overlay.querySelector<HTMLElement>('section.info-panel')!;

  it('shows the title as the heading of a named region, with the description (AC-1, AC-4)', () => {
    createInfoPanel(overlay, INFO, { open: true });
    const heading = region().querySelector('h2');
    expect(heading?.textContent).toBe('Sheen Chair');
    expect(region().getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(heading?.id).toBeTruthy();
    expect(region().querySelector('p')?.textContent).toBe(INFO.description);
  });

  it('goes first in the overlay, so its toggle precedes the Space’s own controls in Tab order (AC-4)', () => {
    createInfoPanel(overlay, INFO, { open: true });
    expect(overlay.firstElementChild?.contains(toggle())).toBe(true);
  });

  it('open: the toggle reads "Hide info", is expanded and controls the region (AC-2)', () => {
    createInfoPanel(overlay, INFO, { open: true });
    expect(toggle().textContent).toBe('Hide info');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-controls')).toBe(region().id);
    expect(toggle().type).toBe('button');
    expect(region().hidden).toBe(false);
  });

  it('collapsed: the toggle names the Space, so the title stays reachable (AC-2)', () => {
    createInfoPanel(overlay, INFO, { open: false });
    expect(toggle().textContent).toBe('About Sheen Chair');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(region().hidden).toBe(true);
  });

  it('clicking toggles, reports the new state, and keeps focus on the toggle (AC-2)', () => {
    const onToggle = vi.fn();
    createInfoPanel(overlay, INFO, { open: true, onToggle });
    toggle().focus();

    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(region().hidden).toBe(true);
    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(document.activeElement).toBe(toggle());

    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(onToggle).toHaveBeenLastCalledWith(true);
    expect(document.activeElement).toBe(toggle());
  });

  it('two panels get distinct ids', () => {
    createInfoPanel(overlay, INFO, { open: true });
    const first = region().id;
    const other = document.createElement('div');
    createInfoPanel(other, INFO, { open: true });
    expect(other.querySelector('section.info-panel')?.id).not.toBe(first);
  });

  it('dispose() removes it and leaves the Space’s UI alone (AC-15)', () => {
    const panel = createInfoPanel(overlay, INFO, { open: true });
    panel.dispose();
    expect(overlay.querySelector('.info')).toBeNull();
    expect(overlay.querySelector('canvas-ui')).not.toBeNull();
  });
});
