/**
 * Replaces the container's content with a readable "WebGL unavailable" message and marks
 * `statusElement` with `data-webgl="unavailable"` for tests (spec 005, AC-3).
 */
export function renderWebGLFallback(
  container: HTMLElement,
  statusElement: HTMLElement = document.body,
): void {
  container.replaceChildren();
  statusElement.dataset.webgl = 'unavailable';
  const box = document.createElement('div');
  box.className = 'fallback';
  box.setAttribute('role', 'alert');

  const heading = document.createElement('h1');
  heading.textContent = 'WebGL2 is not available';
  const text = document.createElement('p');
  text.textContent =
    'This site needs WebGL2 to show 3D spaces. Try a recent version of Chrome, Edge, Firefox, or Safari, ' +
    'and make sure hardware acceleration is enabled.';

  box.append(heading, text);
  container.append(box);
}
