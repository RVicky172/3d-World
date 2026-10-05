/** A marked point on a Space's model with a short annotation (spec 012, AC-5, AC-13). Pure data. */
export interface HotspotConfig {
  /** Kebab-case, unique per Space. */
  id: string;
  /** ≤ 4 words. */
  title: string;
  /** ≤ 2 sentences. */
  text: string;
  /** Point on the model, in the model's own (glTF scene) coordinates. */
  position: readonly [number, number, number];
  /** Direction to view it from (Q3), pointing from the model towards the camera. */
  view: readonly [number, number, number];
}
