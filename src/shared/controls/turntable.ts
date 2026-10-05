/**
 * Idle "turntable" state (spec 004, AC-11): active while the visitor is idle, off from any interaction
 * until `idleDelay` seconds of Space time pass. Advanced only by `tick(delta)`, never the wall clock.
 * Disabled entirely under reduced motion (AC-7).
 */
export class Turntable {
  private idleFor: number;
  private held = false;

  constructor(
    private readonly idleDelay: number,
    private readonly enabled: boolean,
  ) {
    this.idleFor = idleDelay; // starts idle: the turntable runs when a Space opens
  }

  get active(): boolean {
    return this.enabled && !this.held && this.idleFor >= this.idleDelay;
  }

  tick(deltaSeconds: number): void {
    this.idleFor += deltaSeconds;
  }

  interact(): void {
    this.idleFor = 0;
  }

  /**
   * Keeps the turntable still, e.g. while an annotation is open (spec 012, AC-12). Releasing counts as an
   * interaction, so it resumes only after the idle delay.
   */
  hold(held: boolean): void {
    if (this.held && !held) this.interact();
    this.held = held;
  }
}
