const INDICATOR_CLASS = 'loading';

export interface LoadingIndicatorUi {
  show(label: string): void;
  hide(): void;
  dispose(): void;
}

/**
 * "Loading <title>…" above the fader (spec 010, AC-8): while a view opens the fader covers the overlay,
 * so the indicator lives in `#app` itself. Announced politely; the SpaceManager decides when to show it.
 */
export function createLoadingIndicator(container: HTMLElement): LoadingIndicatorUi {
  let element: HTMLElement | null = null;

  const hide = () => {
    element?.remove();
    element = null;
  };

  return {
    show(label) {
      hide();
      element = document.createElement('div');
      element.className = INDICATOR_CLASS;
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      element.textContent = `Loading ${label}…`;
      container.append(element);
    },
    hide,
    dispose: hide,
  };
}
