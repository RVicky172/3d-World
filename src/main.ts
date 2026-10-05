import { Color, WebGLRenderer } from 'three';
import './styles/main.css';
import { createRendererOrNull, hasWebGL2, watchReducedMotion } from './core/capabilities';
import { installDebugHook } from './core/debug';
import { readPreference, writePreference } from './core/preferences';
import { ContextGuard } from './core/context-guard';
import { Engine } from './core/engine';
import { HashRouter } from './core/router';
import { SpaceManager } from './core/space-manager';
import { createGalleryView } from './gallery';
import { findSpace, spaces } from './spaces/registry';
import { createBackLink } from './ui/back-link';
import { Fader } from './ui/fader';
import { createInfoPanel } from './ui/info-panel';
import { createLoadingIndicator } from './ui/loading';
import { renderWebGLFallback } from './ui/fallback';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app container missing from index.html');

const isTestBuild = import.meta.env.MODE === 'test';
// Test builds keep the drawing buffer so E2E tests can read canvas pixels.
const renderer = hasWebGL2()
  ? createRendererOrNull(() => new WebGLRenderer({ antialias: true, preserveDrawingBuffer: isTestBuild }))
  : null;

// No WebGL2, or the renderer could not start (spec 005, AC-1/AC-2): a readable message, never a blank page.
if (renderer) startApp(app, renderer);
else renderWebGLFallback(app);

function startApp(app: HTMLElement, renderer: WebGLRenderer): void {
  // Lives as long as the page; read on each fade and each view opened (spec 005, AC-10).
  const motion = watchReducedMotion();
  const reducedMotion = (): boolean => motion.current;

  // One source of truth for the background: the CSS --bg token.
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  renderer.setClearColor(new Color(background || '#000'));

  const engine = new Engine({ container: app, renderer });
  const fader = new Fader(app, { reducedMotion, covered: true });
  // "Loading <title>…" above the fader for slow opens (spec 010, AC-8).
  const loading = createLoadingIndicator(app);
  // Every Space's title and description in the view (spec 012); open/collapsed is remembered (D-020).
  const PANEL_OPEN = 'world.infoPanel.open';
  const infoPanel = (overlay: HTMLElement, info: { title: string; description: string }) =>
    createInfoPanel(overlay, info, {
      open: readPreference(PANEL_OPEN, true),
      onToggle: (open) => writePreference(PANEL_OPEN, open),
    });
  const manager = new SpaceManager({ engine, fader, reducedMotion, loading, infoPanel });
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

  // Spec 005: a lost GPU context shows a message and rebuilds the view if the browser restores it.
  // Lives as long as the page, like the engine.
  new ContextGuard({
    canvas: renderer.domElement,
    container: app,
    engine,
    manager,
    reload: () => window.location.reload(),
  });

  // Literal MODE check: production builds drop the debug module entirely.
  if (import.meta.env.MODE !== 'production') {
    installDebugHook(window, { manager, engine, router }, import.meta.env.MODE);
  }

  engine.start();
  void router.start();
}
