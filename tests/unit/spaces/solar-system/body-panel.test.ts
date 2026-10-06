import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBodyPanel, type BodyPanel } from '../../../../src/spaces/solar-system/body-panel';
import { BODIES } from '../../../../src/spaces/solar-system/data';
import { factsFor } from '../../../../src/spaces/solar-system/facts';

// Spec 023, AC-2, AC-3, AC-9, AC-10, AC-12: the body list and facts card inside the info panel.

describe('createBodyPanel', () => {
  let container: HTMLElement;
  let panel: BodyPanel;
  let onSelect: ReturnType<typeof vi.fn<(id: string) => void>>;
  let onClose: ReturnType<typeof vi.fn<() => void>>;

  const create = () => {
    onSelect = vi.fn<(id: string) => void>();
    onClose = vi.fn<() => void>();
    panel = createBodyPanel({ container, bodies: BODIES, factsFor, onSelect, onClose });
    return panel;
  };
  const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('.body-list button')];
  const button = (name: string) => buttons().find((b) => b.textContent === name)!;
  const card = () => container.querySelector<HTMLElement>('.body-card')!;
  const announcer = () => container.querySelector<HTMLElement>('[aria-live="polite"]')!;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.replaceChildren(container);
  });
  afterEach(() => panel?.dispose());

  describe('the list (AC-2)', () => {
    it('lists all 16 bodies as buttons: the Sun, the planets in order, each planet’s moons under it', () => {
      create();
      expect(buttons().map((b) => b.textContent)).toEqual([
        'Sun',
        'Mercury',
        'Venus',
        'Earth',
        'Moon',
        'Mars',
        'Jupiter',
        'Io',
        'Europa',
        'Ganymede',
        'Callisto',
        'Saturn',
        'Titan',
        'Uranus',
        'Neptune',
        'Triton',
      ]);
      for (const b of buttons()) expect(b.type).toBe('button');
      // Moons sit in a nested list inside their planet's item.
      const io = button('Io').closest('li')!;
      expect(io.parentElement!.closest('li')!.querySelector(':scope > button')!.textContent).toBe('Jupiter');
      expect(button('Jupiter').closest('ul')!.closest('li')).toBeNull();
    });

    it('is a list labelled by its "Bodies" heading', () => {
      create();
      const list = container.querySelector<HTMLElement>('.body-list')!;
      const heading = container.querySelector<HTMLElement>(`#${list.getAttribute('aria-labelledby')}`)!;
      expect(heading.tagName).toBe('H3');
      expect(heading.textContent).toBe('Bodies');
      expect(list.tagName).toBe('UL');
    });

    it('a button asks to select its body; nothing changes until the Space says so', () => {
      create();
      button('Mars').click();
      expect(onSelect).toHaveBeenCalledWith('mars');
      expect(button('Mars').getAttribute('aria-pressed')).toBe('false');
      expect(card().hidden).toBe(true);
    });
  });

  describe('selection (AC-3, AC-9)', () => {
    it('setSelected moves aria-pressed, one body at a time', () => {
      create();
      expect(buttons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
      panel.setSelected('mars');
      expect(
        buttons()
          .filter((b) => b.getAttribute('aria-pressed') === 'true')
          .map((b) => b.textContent),
      ).toEqual(['Mars']);
      panel.setSelected('io');
      expect(button('Mars').getAttribute('aria-pressed')).toBe('false');
      expect(button('Io').getAttribute('aria-pressed')).toBe('true');
    });

    it('shows the facts card: the name as a heading, the description, the rows and a close button', () => {
      create();
      panel.setSelected('earth');
      const facts = factsFor('earth');
      expect(card().hidden).toBe(false);
      const heading = card().querySelector('h3')!;
      expect(heading.textContent).toBe('Earth');
      expect(card().getAttribute('aria-labelledby')).toBe(heading.id);
      expect(card().querySelector('.body-card-description')!.textContent).toBe(facts.description);
      const terms = [...card().querySelectorAll('dt')].map((d) => d.textContent);
      const values = [...card().querySelectorAll('dd')].map((d) => d.textContent);
      expect(terms).toEqual(facts.rows.map((r) => r.label));
      expect(values).toEqual(facts.rows.map((r) => r.value));
      const close = card().querySelector<HTMLButtonElement>('button')!;
      expect(close.getAttribute('aria-label')).toBe('Close Earth');
    });

    it('the card comes before the list, so the facts are first in the panel', () => {
      create();
      panel.setSelected('earth');
      expect(
        card().compareDocumentPosition(container.querySelector('.body-list')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('announces "<Name> selected" and "Selection cleared" politely', () => {
      create();
      expect(announcer().textContent).toBe('');
      panel.setSelected('saturn');
      expect(announcer().textContent).toBe('Saturn selected');
      panel.setSelected(null);
      expect(announcer().textContent).toBe('Selection cleared');
      expect(card().hidden).toBe(true);
      expect(buttons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    });

    it('selecting the same body again changes nothing', () => {
      create();
      panel.setSelected('saturn');
      announcer().textContent = '';
      panel.setSelected('saturn');
      expect(announcer().textContent).toBe('');
    });

    it('the card’s Close asks to close', () => {
      create();
      panel.setSelected('earth');
      card().querySelector<HTMLButtonElement>('button')!.click();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('live distance (AC-10)', () => {
    it('setLive writes the text only when it changes, outside any live region', () => {
      create();
      panel.setSelected('earth');
      const live = card().querySelector<HTMLElement>('.body-card-live')!;
      panel.setLive('Now: 147.1 million km from the Sun');
      expect(live.textContent).toBe('Now: 147.1 million km from the Sun');
      expect(live.closest('[aria-live]')).toBeNull();
      const observer = new MutationObserver(() => {});
      observer.observe(live, { childList: true, characterData: true, subtree: true });
      panel.setLive('Now: 147.1 million km from the Sun');
      expect(observer.takeRecords()).toHaveLength(0);
      observer.disconnect();
      panel.setLive(null);
      expect(live.hidden).toBe(true);
    });
  });

  describe('focus (AC-12)', () => {
    it('restoreFocus returns focus to the opener when it is still there', () => {
      create();
      button('Mars').focus();
      const opener = document.activeElement as HTMLElement;
      panel.setSelected('mars');
      card().querySelector<HTMLButtonElement>('button')!.focus();
      panel.setSelected(null);
      panel.restoreFocus(opener);
      expect(document.activeElement).toBe(button('Mars'));
    });

    it('closing moves focus off the hidden card even without an opener', () => {
      create();
      panel.setSelected('mars');
      card().querySelector<HTMLButtonElement>('button')!.focus();
      panel.setSelected(null);
      panel.restoreFocus(null);
      expect(document.activeElement).toBe(button('Mars'));
    });
  });

  it('buttons have 44 px targets (the stylesheet)', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles/main.css', 'utf8');
    document.head.append(style);
    try {
      create();
      expect(getComputedStyle(button('Earth')).minHeight).toBe('44px');
    } finally {
      style.remove();
    }
  });

  it('dispose() removes everything it added', () => {
    create();
    panel.dispose();
    expect(container.childElementCount).toBe(0);
  });
});
