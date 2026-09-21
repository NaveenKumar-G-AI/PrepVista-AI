import { Clock, RandomSource } from '../domain/ports';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SystemRandom implements RandomSource {
  next(): number {
    return Math.random();
  }
}

/**
 * Deterministic seeded RNG (mulberry32), used so that "for identical state
 * and configuration, the selection engine should behave predictably" (spec
 * section 90) is actually testable.
 */
export class SeededRandom implements RandomSource {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
