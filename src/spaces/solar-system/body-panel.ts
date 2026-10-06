import type { BodyFactsView } from './facts';

let panels = 0;

export interface BodyPanel {
  /** Shows a body's facts card, marks its list button pressed and announces it; null clears all three. */
  setSelected(id: string | null): void;
  /** The selected body's live distance (spec 023, AC-10); written only when it changes; null hides it. */
  setLive(text: string | null): void;
  /**
   * After closing, puts focus back on `opener` (the control that made the selection) if it is still in the page,
   * else on the list button of the body that was selected (AC-12).
   */
  restoreFocus(opener: HTMLElement | null): void;
  dispose(): void;
}

/**
 * The Solar System's part of the info panel (spec 023, plan §9): a facts card for the selected body, then a list
 * of every body as buttons (the keyboard and screen-reader way to select, AC-2), and a polite announcer. The
 * buttons only ask (`onSelect`); the Space decides and calls `setSelected`, so a click on the canvas and a list
 * button take the same path.
 */
export function createBodyPanel(options: {
  container: HTMLElement;
  bodies: ReadonlyArray<{ id: string; name: string; parent: string | null; kind: string }>;
  factsFor(id: string): BodyFactsView;
  onSelect(id: string): void;
  onClose(): void;
}): BodyPanel {
  const { container, bodies, factsFor, onSelect, onClose } = options;
  const id = `body-panel-${++panels}`;
  const added: HTMLElement[] = [];

  // --- Card (first, so the facts lead the panel while a body is selected).
  const card = document.createElement('section');
  card.className = 'body-card';
  card.hidden = true;
  const heading = document.createElement('h3');
  heading.id = `${id}-name`;
  card.setAttribute('aria-labelledby', heading.id);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'body-card-close';
  close.textContent = 'Close';
  close.addEventListener('click', () => onClose());
  const header = document.createElement('div');
  header.className = 'body-card-header';
  header.append(heading, close);
  const description = document.createElement('p');
  description.className = 'body-card-description';
  const rows = document.createElement('dl');
  rows.className = 'body-card-facts';
  const live = document.createElement('p');
  live.className = 'body-card-live';
  live.hidden = true;
  card.append(header, description, rows, live);

  // --- List: the Sun, then each planet with its moons nested under it.
  const listHeading = document.createElement('h3');
  listHeading.id = `${id}-list`;
  listHeading.className = 'body-list-heading';
  listHeading.textContent = 'Bodies';
  const list = document.createElement('ul');
  list.className = 'body-list';
  list.setAttribute('aria-labelledby', listHeading.id);
  const buttons = new Map<string, HTMLButtonElement>();
  const item = (body: { id: string; name: string }) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = body.name;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => onSelect(body.id));
    buttons.set(body.id, button);
    li.append(button);
    return li;
  };
  for (const body of bodies) {
    if (body.kind === 'moon') continue;
    const li = item(body);
    const moons = bodies.filter((b) => b.kind === 'moon' && b.parent === body.id);
    if (moons.length > 0) {
      const sub = document.createElement('ul');
      sub.append(...moons.map(item));
      li.append(sub);
    }
    list.append(li);
  }

  const announcer = document.createElement('p');
  announcer.className = 'visually-hidden';
  announcer.setAttribute('aria-live', 'polite');

  added.push(card, listHeading, list, announcer);
  container.append(...added);

  let selected: string | null = null;
  let lastSelected: string | null = null;
  let liveText: string | null = null;

  return {
    setSelected(next) {
      if (next === selected) return;
      if (selected) buttons.get(selected)?.setAttribute('aria-pressed', 'false');
      selected = next;
      if (!next) {
        card.hidden = true;
        announcer.textContent = 'Selection cleared';
        return;
      }
      lastSelected = next;
      buttons.get(next)?.setAttribute('aria-pressed', 'true');
      const facts = factsFor(next);
      heading.textContent = facts.name;
      close.setAttribute('aria-label', `Close ${facts.name}`);
      description.textContent = facts.description;
      rows.replaceChildren(
        ...facts.rows.flatMap((row) => {
          const term = document.createElement('dt');
          term.textContent = row.label;
          const value = document.createElement('dd');
          value.textContent = row.value;
          return [term, value];
        }),
      );
      liveText = null;
      live.textContent = '';
      live.hidden = true;
      card.hidden = false;
      // The facts lead the panel: scroll it back to the top, or a list button tapped further down keeps the card
      // out of sight in a short bottom sheet (T063).
      const scroller = container.closest<HTMLElement>('.info-panel');
      if (scroller) scroller.scrollTop = 0;
      announcer.textContent = `${facts.name} selected`;
    },
    setLive(text) {
      if (text === liveText) return;
      liveText = text;
      live.hidden = text === null;
      live.textContent = text ?? '';
    },
    restoreFocus(opener) {
      const target = opener?.isConnected ? opener : lastSelected ? buttons.get(lastSelected) : null;
      target?.focus();
    },
    dispose() {
      for (const el of added) el.remove();
    },
  };
}
