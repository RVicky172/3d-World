import { Color, WebGLRenderer } from 'three';
import './styles/main.css';
import { hasWebGL2, prefersReducedMotion } from './core/capabilities';
import { installDebugHook } from './core/debug';
import { Engine } from './core/engine';
import { SpaceManager } from './core/space-manager';
import { Fader } from './ui/fader';
import { renderWebGLFallback } from './ui/fallback';

/** Until the router (feature 002) lands, `?space=<id>` picks the Space. */
const DEFAULT_SPACE_ID = 'demo-cube';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app container missing from index.html');

if (!hasWebGL2()) {
  renderWebGLFallback(app);
} else {
  const isTestBuild = import.meta.env.MODE === 'test';
  const reducedMotion = prefersReducedMotion();

  // Test builds keep the drawing buffer so E2E tests can read canvas pixels.
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: isTestBuild });
  // One source of truth for the background: the CSS --bg token.
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  renderer.setClearColor(new Color(background || '#000'));

  const engine = new Engine({ container: app, renderer });
  const fader = new Fader(app, { reducedMotion, covered: true });
  const manager = new SpaceManager({ engine, fader, reducedMotion });

  // Literal MODE check: production builds drop the debug module entirely.
  if (import.meta.env.MODE !== 'production') {
    installDebugHook(window, { manager, engine }, import.meta.env.MODE);
  }

  engine.start();
  const requested = new URLSearchParams(window.location.search).get('space');
  void manager.open(requested ?? DEFAULT_SPACE_ID);
}
