import { announcementFor, clampProgress } from '../core/progress';

const INDICATOR_CLASS = 'loading';

export interface LoadingIndicatorUi {
  /** `background`: the compact variant for content arriving after a view is ready (spec 022). */
  show(label: string, options?: { background?: boolean }): void;
  /**
   * Download progress, 0–1 (spec 011, AC-8). The first value turns the indicator determinate; null (total
   * unknown) keeps 010's look until a value arrives. Ignored while hidden.
   */
  progress(fraction: number | null): void;
  /** The view is ready: hides a shown indicator and announces "<title> loaded" (D-019). Silent if hidden. */
  ready(): void;
  hide(): void;
  dispose(): void;
}

interface Shown {
  element: HTMLElement;
  label: string;
  /** Spoken text, inside the live region. Visually hidden once progress shows. */
  spoken: HTMLElement;
  value: number | null;
  /** Visible percentage and bar, created on the first progress value. */
  determinate: { text: HTMLElement; bar: HTMLElement; fill: HTMLElement } | null;
}

/**
 * "Loading <title>…" above the fader (spec 010, AC-8): while a view opens the fader covers the overlay,
 * so the indicator lives in `#app` itself. Announced politely; the SpaceManager decides when to show it.
 *
 * With progress (spec 011) it also shows "Loading <title>… 42 %" and a bar. The visible text is
 * `aria-hidden`, and the bar is a `progressbar` (value changes aren't live announcements), so screen readers
 * hear only the spoken text, which changes at 25, 50 and 75 % (AC-9). Once the view is ready, `ready()`
 * announces "<title> loaded" (D-019).
 */
export function createLoadingIndicator(container: HTMLElement): LoadingIndicatorUi {
  let shown: Shown | null = null;
  /**
   * Persistent polite region for "<title> loaded". It outlives the indicator (whose removal screen readers
   * don't announce), and exists before its text changes, which live regions need to be read reliably.
   */
  let announcer: HTMLElement | null = null;

  const hide = () => {
    shown?.element.remove();
    shown = null;
  };

  const makeDeterminate = (state: Shown) => {
    const text = document.createElement('span');
    text.className = 'loading-text';
    text.setAttribute('aria-hidden', 'true');

    const bar = document.createElement('div');
    bar.className = 'loading-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', `Loading ${state.label}`);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const fill = document.createElement('div');
    fill.className = 'loading-bar-fill';
    bar.append(fill);

    // A class change, not a text change, so switching modes isn't announced again.
    state.spoken.classList.add('visually-hidden');
    state.element.dataset.progress = '';
    state.element.append(text, bar);
    return { text, bar, fill };
  };

  return {
    show(label, { background = false } = {}) {
      hide();
      if (!announcer) {
        announcer = document.createElement('div');
        announcer.className = 'loading-announcer visually-hidden';
        announcer.setAttribute('role', 'status');
        announcer.setAttribute('aria-live', 'polite');
        container.append(announcer);
      }
      announcer.textContent = ''; // so the same title can be announced again
      const element = document.createElement('div');
      element.className = background ? `${INDICATOR_CLASS} is-background` : INDICATOR_CLASS;
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      const spoken = document.createElement('span');
      spoken.className = 'loading-label';
      spoken.textContent = `Loading ${label}…`;
      element.append(spoken);
      container.append(element);
      shown = { element, label, spoken, value: null, determinate: null };
    },
    progress(fraction) {
      if (!shown) return;
      const value = clampProgress(shown.value, fraction);
      if (value === null || value === shown.value) return;

      const step = announcementFor(shown.value, value);
      shown.value = value;
      shown.determinate ??= makeDeterminate(shown);

      const percent = Math.floor(value * 100);
      shown.determinate.text.textContent = `Loading ${shown.label}… ${percent} %`;
      shown.determinate.bar.setAttribute('aria-valuenow', String(percent));
      shown.determinate.fill.style.width = `${percent}%`;
      if (step !== null) shown.spoken.textContent = `Loading ${shown.label}… ${step} %`;
    },
    ready() {
      if (!shown) return;
      const { label } = shown;
      hide();
      if (announcer) announcer.textContent = `${label} loaded`;
    },
    hide,
    dispose() {
      hide();
      announcer?.remove();
      announcer = null;
    },
  };
}
