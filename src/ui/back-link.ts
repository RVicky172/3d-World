import { formatRoute, HOME_ROUTE } from '../core/routes';

/**
 * Permanent "Back to gallery" link (spec 003, AC-7). A real link, so it is keyboard-reachable and adds
 * a history entry. CSS hides it while the gallery itself is showing (`body[data-view="gallery"]`).
 */
export function createBackLink(container: HTMLElement): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'back-to-gallery';
  link.href = formatRoute(HOME_ROUTE);

  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '←';

  link.append(arrow, ' Back to gallery');
  container.append(link);
  return link;
}
