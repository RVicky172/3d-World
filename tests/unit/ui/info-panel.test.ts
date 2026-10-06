import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInfoPanel } from '../../../src/ui/info-panel';

// Spec 012: every Space shows its title and description (AC-1) in a collapsible, accessible panel (AC-2, AC-4).

const INFO = { title: 'Sheen Chair', description: 'A velvet lounge chair to turn, zoom and inspect.' };

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

  describe('slot for the Space’s own content (spec 023, plan §8)', () => {
    const description = () => region().querySelector<HTMLElement>('p')!;

    it('gives an empty element inside the region, after the description', () => {
      const { slot } = createInfoPanel(overlay, INFO, { open: true });
      expect(slot.content.childElementCount).toBe(0);
      expect(region().contains(slot.content)).toBe(true);
      expect(
        description().compareDocumentPosition(slot.content) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('showDescription hides and shows only the description', () => {
      const { slot } = createInfoPanel(overlay, INFO, { open: true });
      slot.content.append(document.createElement('ul'));
      slot.showDescription(false);
      expect(description().hidden).toBe(true);
      expect(region().querySelector('h2')!.hidden).toBe(false);
      expect(slot.content.hidden).toBe(false);
      slot.showDescription(true);
      expect(description().hidden).toBe(false);
    });

    it('open() expands a collapsed panel without reporting it as the visitor’s choice', () => {
      const onToggle = vi.fn();
      const { slot } = createInfoPanel(overlay, INFO, { open: false, onToggle });
      slot.open();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(region().hidden).toBe(false);
      expect(toggle().textContent).toBe('Hide info');
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('onOpenChange hears toggle clicks and open(), but not an open() that changes nothing', () => {
      const { slot } = createInfoPanel(overlay, INFO, { open: false });
      const changes: boolean[] = [];
      slot.onOpenChange((open) => changes.push(open));
      slot.open();
      slot.open();
      toggle().click();
      toggle().click();
      expect(changes).toEqual([true, false, true]);
    });

    it('dispose() removes the slot’s content with the panel', () => {
      const panel = createInfoPanel(overlay, INFO, { open: true });
      panel.slot.content.append(document.createElement('ul'));
      panel.dispose();
      expect(overlay.querySelector('ul')).toBeNull();
    });
  });
});
