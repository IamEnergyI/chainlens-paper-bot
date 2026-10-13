/** Injectable clock for deterministic expiry/retry tests. */
export interface Clock {
  nowMs(): number;
}
export class SystemClock implements Clock {
  nowMs(): number { return Date.now(); }
}
export class FixedClock implements Clock {
  constructor(private t: number) {}
  nowMs(): number { return this.t; }
  advance(ms: number): void { this.t += ms; }
}
