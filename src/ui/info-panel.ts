import type { InfoSlot } from '../core/types';

let panels = 0;

export interface InfoPanel {
  /** Where the Space adds its own content (spec 023). */
  slot: InfoSlot;
  dispose(): void;
}

/**
 * A Space's title and description inside the view (spec 012, AC-1). The SpaceManager mounts one for every
 * registry Space, with the same strings as its gallery card, and **prepends** it to the overlay so its toggle
 * comes right after the 3D view in Tab order (AC-4). Collapsible (AC-2); the toggle is named after the Space
 * while collapsed, so the title stays reachable. State lives in `aria-expanded` (TypeScript types `hidden` as
 * `boolean | "until-found"`, so it's only ever written here).
 */
export function createInfoPanel(
  overlay: HTMLElement,
  info: { title: string; description: string },
  options: { open: boolean; onToggle?: (open: boolean) => void },
): InfoPanel {
  const id = `info-panel-${++panels}`;

  const root = document.createElement('div');
  root.className = 'info';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'info-toggle';
  toggle.setAttribute('aria-controls', id);

  const region = document.createElement('section');
  region.id = id;
  region.className = 'info-panel';
  const heading = document.createElement('h2');
  heading.id = `${id}-title`;
  heading.textContent = info.title;
  region.setAttribute('aria-labelledby', heading.id);
  const description = document.createElement('p');
  description.textContent = info.description;
  const content = document.createElement('div');
  content.className = 'info-space';
  region.append(heading, description, content);

  const listeners: Array<(open: boolean) => void> = [];
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide info' : `About ${info.title}`;
    region.hidden = !open;
    root.dataset.open = String(open);
  };
  setOpen(options.open);
  const changed = (open: boolean) => listeners.forEach((listener) => listener(open));

  toggle.addEventListener('click', () => {
    const open = !isOpen();
    setOpen(open);
    options.onToggle?.(open);
    changed(open);
  });

  root.append(toggle, region);
  overlay.prepend(root);
  return {
    slot: {
      content,
      showDescription: (show) => {
        description.hidden = !show;
      },
      open: () => {
        if (isOpen()) return;
        setOpen(true);
        changed(true);
      },
      onOpenChange: (listener) => listeners.push(listener),
    },
    dispose: () => root.remove(),
  };
}
