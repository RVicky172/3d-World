import { Color, WebGLRenderer } from 'three';
import './styles/main.css';
import { hasWebGL2, prefersReducedMotion } from './core/capabilities';
import { installDebugHook } from './core/debug';
import { Engine } from './core/engine';
import { HashRouter } from './core/router';
import { SpaceManager } from './core/space-manager';
import { findSpace } from './spaces/registry';
import { Fader } from './ui/fader';
import { renderWebGLFallback } from './ui/fallback';

/** Shown on the home route until the gallery (003) exists (spec 002, AC-5). */
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
  const router = new HashRouter({
    location: window.location,
    history: window.history,
    events: window,
    openSpace: (id) => manager.open(id),
    defaultSpaceId: DEFAULT_SPACE_ID,
    titleOf: (id) => findSpace(id)?.title,
    setTitle: (title) => (document.title = title),
  });

  // Literal MODE check: production builds drop the debug module entirely.
  if (import.meta.env.MODE !== 'production') {
    installDebugHook(window, { manager, engine, router }, import.meta.env.MODE);
  }

  engine.start();
  void router.start();
}
