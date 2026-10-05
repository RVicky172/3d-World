import type { AssetCredit, AssetLicense } from './types';

const LICENSE_NAMES: Record<AssetLicense, string> = {
  'CC0-1.0': 'CC0 1.0',
  'CC-BY-4.0': 'CC BY 4.0',
  'Public domain': 'Public domain',
};

/**
 * Visible credit for the Space's assets (spec 010, AC-13; required for CC-BY, shown for all):
 * one line per asset, "<title> by <author> · <licence>", the title linking to the source.
 * Returns a function that removes it.
 */
export function showCredit(overlay: HTMLElement, assets: readonly AssetCredit[]): () => void {
  const box = document.createElement('div');
  box.className = 'model-credit';

  for (const asset of assets) {
    const line = document.createElement('p');
    const link = document.createElement('a');
    link.href = asset.source;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = asset.title;
    line.append(link, ` by ${asset.author} · ${LICENSE_NAMES[asset.license]}`);
    box.append(line);
  }

  overlay.append(box);
  return () => box.remove();
}
