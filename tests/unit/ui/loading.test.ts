import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLoadingIndicator } from '../../../src/ui/loading';

describe('createLoadingIndicator (spec 010, AC-8)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  const indicators = () => container.querySelectorAll('.loading');

  it('shows nothing until asked', () => {
    createLoadingIndicator(container);
    expect(indicators()).toHaveLength(0);
  });

  it('show() adds one polite status announcing what is loading', () => {
    const loading = createLoadingIndicator(container);
    loading.show('Sheen Chair');

    expect(indicators()).toHaveLength(1);
    const status = indicators()[0]!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Loading Sheen Chair…');
  });

  it('a second show() replaces the first rather than stacking', () => {
    const loading = createLoadingIndicator(container);
    loading.show('A');
    loading.show('B');
    expect(indicators()).toHaveLength(1);
    expect(indicators()[0]?.textContent).toBe('Loading B…');
  });

  it('hide() removes it, and is safe when nothing is shown', () => {
    const loading = createLoadingIndicator(container);
    loading.hide();
    loading.show('A');
    loading.hide();
    expect(indicators()).toHaveLength(0);
  });

  describe('progress (spec 011, AC-8–AC-11)', () => {
    const indicator = () => indicators()[0] as HTMLElement;
    const bar = () => container.querySelector<HTMLElement>('[role="progressbar"]');
    /** What a screen reader gets from the live region: text outside aria-hidden subtrees. */
    const spoken = (element: Element): string =>
      Array.from(element.childNodes)
        .map((node) => {
          if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
          if (node instanceof Element && node.getAttribute('aria-hidden') !== 'true') return spoken(node);
          return '';
        })
        .join('');
    const visibleText = () => container.querySelector('.loading-text')?.textContent;

    it('shows a percentage and a named progress bar', () => {
      const loading = createLoadingIndicator(container);
      loading.show('Sheen Chair');
      loading.progress(0.42);

      expect(visibleText()).toBe('Loading Sheen Chair… 42 %');
      expect(container.querySelector('.loading-text')?.getAttribute('aria-hidden')).toBe('true');
      expect(bar()?.getAttribute('aria-label')).toBe('Loading Sheen Chair');
      expect(bar()?.getAttribute('aria-valuemin')).toBe('0');
      expect(bar()?.getAttribute('aria-valuemax')).toBe('100');
      expect(bar()?.getAttribute('aria-valuenow')).toBe('42');
      expect(container.querySelector<HTMLElement>('.loading-bar-fill')?.style.width).toBe('42%');
      // Still one polite status, so 010's announcement and roles hold.
      expect(indicator().getAttribute('role')).toBe('status');
      expect(indicator().getAttribute('aria-live')).toBe('polite');
    });

    it('speaks only at 25, 50 and 75 %', () => {
      const loading = createLoadingIndicator(container);
      loading.show('Sheen Chair');
      const heard: string[] = [];
      for (const fraction of [0.05, 0.1, 0.2, 0.26, 0.3, 0.49, 0.5, 0.6, 0.74, 0.8, 0.9, 1]) {
        loading.progress(fraction);
        const text = spoken(indicator());
        if (heard.at(-1) !== text) heard.push(text);
      }
      expect(heard).toEqual([
        'Loading Sheen Chair…',
        'Loading Sheen Chair… 25 %',
        'Loading Sheen Chair… 50 %',
        'Loading Sheen Chair… 75 %',
      ]);
    });

    it('a jump past several steps speaks the highest one once', () => {
      const loading = createLoadingIndicator(container);
      loading.show('A');
      loading.progress(0.1);
      loading.progress(0.8);
      expect(spoken(indicator())).toBe('Loading A… 75 %');
    });

    it('never goes backwards', () => {
      const loading = createLoadingIndicator(container);
      loading.show('A');
      loading.progress(0.6);
      loading.progress(0.3);
      expect(bar()?.getAttribute('aria-valuenow')).toBe('60');
      expect(visibleText()).toBe('Loading A… 60 %');
    });

    it('stops pulsing once it is determinate', () => {
      const loading = createLoadingIndicator(container);
      loading.show('A');
      expect(indicator().hasAttribute('data-progress')).toBe(false);
      loading.progress(0.1);
      expect(indicator().hasAttribute('data-progress')).toBe(true);
    });

    it('an unknown total keeps the 010 look; a later unknown changes nothing', () => {
      const loading = createLoadingIndicator(container);
      loading.show('A');
      loading.progress(null);
      expect(bar()).toBeNull();
      expect(indicator().textContent).toBe('Loading A…');

      loading.progress(0.5);
      loading.progress(null);
      expect(bar()?.getAttribute('aria-valuenow')).toBe('50');
    });

    it('does nothing before show() or after hide(), and show() starts again from nothing', () => {
      const loading = createLoadingIndicator(container);
      loading.progress(0.5);
      expect(indicators()).toHaveLength(0);

      loading.show('A');
      loading.progress(0.9);
      loading.hide();
      loading.progress(0.95);
      expect(indicators()).toHaveLength(0);

      loading.show('B');
      expect(bar()).toBeNull();
      expect(indicator().textContent).toBe('Loading B…');
      loading.progress(0.1);
      expect(bar()?.getAttribute('aria-valuenow')).toBe('10');
    });

    it('rounds down, so it never reads 100 % before the download is complete', () => {
      const loading = createLoadingIndicator(container);
      loading.show('A');
      loading.progress(0.999);
      expect(visibleText()).toBe('Loading A… 99 %');
      loading.progress(1);
      expect(visibleText()).toBe('Loading A… 100 %');
    });
  });

  describe('ready() — "<title> loaded" (spec 011, AC-9, D-019)', () => {
    const announcer = () => container.querySelector<HTMLElement>('.loading-announcer');

    it('replaces a shown indicator with a polite "loaded" announcement', () => {
      const loading = createLoadingIndicator(container);
      loading.show('Sheen Chair');
      loading.progress(0.6);
      loading.ready();

      expect(indicators()).toHaveLength(0); // so 010's "indicator gone" checks hold
      expect(announcer()?.textContent).toBe('Sheen Chair loaded');
      expect(announcer()?.getAttribute('role')).toBe('status');
      expect(announcer()?.getAttribute('aria-live')).toBe('polite');
      expect(announcer()?.classList.contains('visually-hidden')).toBe(true);
    });

    it('announces nothing when no indicator was shown', () => {
      const loading = createLoadingIndicator(container);
      loading.ready();
      expect(announcer()?.textContent ?? '').toBe('');

      loading.show('A');
      loading.hide();
      loading.ready();
      expect(announcer()?.textContent ?? '').toBe('');
    });

    it('the next show() clears the previous announcement, so the same title can be announced again', () => {
      const loading = createLoadingIndicator(container);
      loading.show('A');
      loading.ready();
      loading.show('A');
      expect(announcer()?.textContent).toBe('');
      loading.ready();
      expect(announcer()?.textContent).toBe('A loaded');
      expect(container.querySelectorAll('.loading-announcer')).toHaveLength(1);
    });

    it('dispose() removes the announcer too', () => {
      const loading = createLoadingIndicator(container);
      loading.show('A');
      loading.ready();
      loading.dispose();
      expect(announcer()).toBeNull();
    });
  });

  it('dispose() removes it and leaves other content alone', () => {
    const other = document.createElement('canvas');
    container.append(other);
    const loading = createLoadingIndicator(container);
    loading.show('A');
    loading.dispose();
    expect(indicators()).toHaveLength(0);
    expect(container.contains(other)).toBe(true);
  });

  describe('background variant (spec 022, AC-11)', () => {
    it('show(label, { background: true }) marks it compact and non-blocking, with the same announcements', () => {
      const ui = createLoadingIndicator(container);
      ui.show('Solar System imagery', { background: true });
      const element = container.querySelector<HTMLElement>('.loading')!;
      expect(element.classList.contains('is-background')).toBe(true);
      expect(element.getAttribute('aria-live')).toBe('polite');
      expect(element.textContent).toBe('Loading Solar System imagery…');
      ui.progress(0.5);
      expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
      ui.ready();
      expect(container.querySelector('.loading-announcer')?.textContent).toBe('Solar System imagery loaded');
    });

    it('never blocks the view: the compact variant takes no pointer events (main.css)', () => {
      const style = document.createElement('style');
      style.textContent = readFileSync('src/styles/main.css', 'utf8');
      document.head.append(style);
      document.body.append(container);
      const ui = createLoadingIndicator(container);
      ui.show('Solar System imagery', { background: true });
      expect(getComputedStyle(container.querySelector('.loading')!).pointerEvents).toBe('none');
      ui.show('Space A');
      expect(getComputedStyle(container.querySelector('.loading')!).pointerEvents).not.toBe('none');
      style.remove();
      container.remove();
    });

    it('a normal show() is not compact', () => {
      const ui = createLoadingIndicator(container);
      ui.show('Space A');
      expect(container.querySelector('.loading')!.classList.contains('is-background')).toBe(false);
    });
  });
});
