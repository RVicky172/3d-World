/** Replaces the container's content with a readable "WebGL unavailable" message. */
export function renderWebGLFallback(container: HTMLElement): void {
  container.replaceChildren();
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
