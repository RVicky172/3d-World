import type { ScaleMode } from './types';

/** What each scale means, read as the 3D view's description and announced on a switch (AC-7, NFR). */
const DESCRIPTIONS: Record<ScaleMode, string> = {
  stylised:
    'Stylised scale: sizes and distances are compressed so every body is visible. Planets keep their order, and bigger bodies stay bigger.',
  real: 'True scale: sizes and distances share one scale, so the planets are far smaller than a pixel. Name markers show where they are; zoom in on one to see it.',
};

let toggles = 0;

export interface ScaleToggle {
  /** Shows `mode` without reporting a change (e.g. after a restore). */
  set(mode: ScaleMode): void;
  dispose(): void;
}

/**
 * The scale switch (spec 020, AC-7): a "True scale" toggle button (`aria-pressed`, so pressed = real), and a
 * visually hidden polite description of the current scale. The canvas's `aria-describedby` points at that
 * description, so the 3D view always says which scale it shows, and changing it is announced. Focus stays on
 * the button.
 */
export function createScaleToggle(options: {
  overlay: HTMLElement;
  canvas: HTMLElement;
  signal: AbortSignal;
  mode: ScaleMode;
  onChange(mode: ScaleMode): void;
}): ScaleToggle {
  const { overlay, canvas, onChange } = options;
  const listeners = new AbortController();
  options.signal.addEventListener('abort', () => listeners.abort(), { once: true, signal: listeners.signal });

  const root = document.createElement('div');
  root.className = 'scale';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scale-toggle';
  button.textContent = 'True scale';
  const description = document.createElement('p');
  description.id = `scale-description-${++toggles}`;
  description.className = 'visually-hidden';
  description.setAttribute('aria-live', 'polite');
  root.append(button, description);
  overlay.append(root);
  canvas.setAttribute('aria-describedby', description.id);

  let mode = options.mode;
  const show = (next: ScaleMode) => {
    mode = next;
    button.setAttribute('aria-pressed', String(next === 'real'));
    description.textContent = DESCRIPTIONS[next];
  };
  show(mode);

  button.addEventListener(
    'click',
    () => {
      show(mode === 'real' ? 'stylised' : 'real');
      onChange(mode);
    },
    { signal: listeners.signal },
  );

  return {
    set: show,
    dispose() {
      listeners.abort();
      root.remove();
      if (canvas.getAttribute('aria-describedby') === description.id)
        canvas.removeAttribute('aria-describedby');
    },
  };
}
