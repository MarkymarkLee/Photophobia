// Lumi's internal state. No words live here — everything Lumi says comes from the LLM.
// This only tracks the happiness level (0–100) that drives the light, plus how it
// drifts over time when nobody is talking.

export type Emotion =
  | "ecstatic"
  | "happy"
  | "content"
  | "neutral"
  | "sad"
  | "crying"
  | "grumpy"
  | "angry"
  | "shy"
  | "surprised"
  | "sleepy"
  | "love";

export const EMOTIONS: Emotion[] = [
  "ecstatic",
  "happy",
  "content",
  "neutral",
  "sad",
  "crying",
  "grumpy",
  "angry",
  "shy",
  "surprised",
  "sleepy",
  "love",
];

export type BrainEvent = "idle";

export class Brain {
  happiness = 60;
  private lastInteraction = Date.now();
  private lastIdleNudge = 0;

  get isAsleep(): boolean {
    return Date.now() - this.lastInteraction > 90_000;
  }

  /** Baseline face when Lumi isn't reacting to anything in particular. */
  mood(): Emotion {
    if (this.isAsleep) return "sleepy";
    const h = this.happiness;
    if (h >= 90) return "ecstatic";
    if (h >= 72) return "happy";
    if (h >= 55) return "content";
    if (h >= 40) return "neutral";
    if (h >= 22) return "sad";
    return "crying";
  }

  touch() {
    this.lastInteraction = Date.now();
  }

  /** Apply a happiness change decided by the inner-feelings model. */
  apply(delta: number) {
    this.touch();
    this.happiness = Math.max(0, Math.min(100, this.happiness + delta));
  }

  /** Called every few seconds. Silence slowly makes Lumi lonely; returns an event when it wants attention. */
  tick(): BrainEvent | null {
    const idle = Date.now() - this.lastInteraction;
    if (idle > 25_000) {
      const rest = 42;
      if (this.happiness > rest) this.happiness -= 0.6;
      else if (this.happiness < rest - 10) this.happiness += 0.3;
    }
    if (idle > 45_000 && idle < 90_000 && Date.now() - this.lastIdleNudge > 40_000) {
      this.lastIdleNudge = Date.now();
      return "idle";
    }
    return null;
  }
}
