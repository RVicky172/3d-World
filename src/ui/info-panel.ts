let panels = 0;

export interface InfoPanel {
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
  region.append(heading, description);

  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide info' : `About ${info.title}`;
    region.hidden = !open;
    root.dataset.open = String(open);
  };
  setOpen(options.open);

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
    options.onToggle?.(open);
  });

  root.append(toggle, region);
  overlay.prepend(root);
  return { dispose: () => root.remove() };
}
