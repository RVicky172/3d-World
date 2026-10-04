/** How long the hint stays up, in seconds of Space time (spec 004, AC-10). */
export const HINT_SECONDS = 4;

const HINT_TEXT = {
  fine: 'Drag to rotate · Scroll to zoom · Right-drag to pan · R to reset',
  coarse: 'Drag to rotate · Pinch to zoom · Two-finger drag to pan',
};

const HELP: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]> = [
  [
    'Mouse',
    [
      ['Drag', 'Rotate'],
      ['Scroll', 'Zoom'],
      ['Right-drag or Shift + drag', 'Pan'],
    ],
  ],
  [
    'Touch',
    [
      ['One-finger drag', 'Rotate'],
      ['Pinch', 'Zoom'],
      ['Two-finger drag', 'Pan'],
    ],
  ],
  [
    'Keyboard (when the 3D view is focused)',
    [
      ['Arrow keys', 'Rotate'],
      ['Shift + arrow keys', 'Pan'],
      ['+ / −', 'Zoom'],
      ['R', 'Reset view'],
    ],
  ],
];

export interface ControlsUiOptions {
  overlay: HTMLElement;
  signal: AbortSignal;
  coarsePointer: boolean;
  onReset(): void;
}

export interface ControlsUi {
  /** Advances the hint's lifetime by Space time. */
  tick(deltaSeconds: number): void;
  dismissHint(): void;
  dispose(): void;
}

let panelCount = 0;

/** Discoverability UI for camera controls: fading hint, "?" help panel, "Reset view" button. */
export function createControlsUi({ overlay, signal, coarsePointer, onReset }: ControlsUiOptions): ControlsUi {
  let hint: HTMLElement | null = document.createElement('p');
  hint.className = 'controls-hint';
  hint.setAttribute('aria-live', 'polite');
  hint.textContent = coarsePointer ? HINT_TEXT.coarse : HINT_TEXT.fine;
  let hintAge = 0;

  const bar = document.createElement('div');
  bar.className = 'controls-bar';

  const panel = document.createElement('section');
  panel.className = 'controls-help';
  panel.id = `controls-help-${++panelCount}`;
  panel.hidden = true;
  panel.append(heading('Camera controls'), ...HELP.map(([title, rows]) => helpGroup(title, rows)));

  const toggle = button('?', 'controls-help-toggle');
  toggle.setAttribute('aria-label', 'Camera controls help');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', panel.id);

  const reset = button('Reset view', 'controls-reset');

  // aria-expanded is the source of truth (`hidden` is typed boolean | "until-found").
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!isOpen()), { signal });
  reset.addEventListener('click', () => onReset(), { signal });
  bar.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    },
    { signal },
  );

  bar.append(panel, toggle, reset);
  overlay.append(hint, bar);

  const dismissHint = () => {
    hint?.remove();
    hint = null;
  };

  return {
    tick(delta) {
      if (!hint) return;
      hintAge += delta;
      if (hintAge >= HINT_SECONDS) dismissHint();
    },
    dismissHint,
    dispose() {
      dismissHint();
      bar.remove();
    },
  };
}

function button(text: string, className: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  return el;
}

function heading(text: string): HTMLHeadingElement {
  const el = document.createElement('h2');
  el.textContent = text;
  return el;
}

function helpGroup(title: string, rows: ReadonlyArray<readonly [string, string]>): HTMLElement {
  const group = document.createElement('div');
  const name = document.createElement('h3');
  name.textContent = title;
  const list = document.createElement('dl');
  for (const [input, effect] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = input;
    const dd = document.createElement('dd');
    dd.textContent = effect;
    list.append(dt, dd);
  }
  group.append(name, list);
  return group;
}
