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

  it('dispose() removes it and leaves other content alone', () => {
    const other = document.createElement('canvas');
    container.append(other);
    const loading = createLoadingIndicator(container);
    loading.show('A');
    loading.dispose();
    expect(indicators()).toHaveLength(0);
    expect(container.contains(other)).toBe(true);
  });
});
