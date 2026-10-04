import { describe, expect, it } from 'vitest';
import { createBackLink } from '../../../src/ui/back-link';

describe('createBackLink', () => {
  it('adds a real link to the gallery (#/) to the container (AC-7)', () => {
    const container = document.createElement('div');
    const link = createBackLink(container);
    expect(link.parentElement).toBe(container);
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('#/');
    expect(link.classList.contains('back-to-gallery')).toBe(true);
  });

  it('goes first in the container, so Tab order matches the layout (spec 004, AC-9)', () => {
    const container = document.createElement('div');
    container.append(document.createElement('canvas'), document.createElement('div'));
    const link = createBackLink(container);
    expect(container.firstElementChild).toBe(link);
  });

  it('is named "Back to gallery" by its visible text; the arrow is decorative', () => {
    const link = createBackLink(document.createElement('div'));
    const visibleText = [...link.childNodes]
      .filter((n) => !(n instanceof Element && n.getAttribute('aria-hidden') === 'true'))
      .map((n) => n.textContent)
      .join('')
      .trim();
    expect(visibleText).toBe('Back to gallery');
    expect(link.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
