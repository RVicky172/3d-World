import { Color, WebGLRenderer } from 'three';
import './styles/main.css';
import { hasWebGL2, prefersReducedMotion } from './core/capabilities';
import { installDebugHook } from './core/debug';
import { Engine } from './core/engine';
import { HashRouter } from './core/router';
import { SpaceManager } from './core/space-manager';
import { createGalleryView } from './gallery';
import { findSpace, spaces } from './spaces/registry';
import { createBackLink } from './ui/back-link';
import { Fader } from './ui/fader';
import { renderWebGLFallback } from './ui/fallback';

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
  // Home page (spec 003): a view built from registry metadata only, so no Space code loads here.
  const gallery = createGalleryView({ spaces, baseUrl: import.meta.env.BASE_URL });
  createBackLink(app);
  const router = new HashRouter({
    location: window.location,
    history: window.history,
    events: window,
    openSpace: (id) => manager.open(id),
    openGallery: () => manager.openView('gallery', gallery),
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
