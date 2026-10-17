// Lumi's internal state. No words live here — everything Lumi says comes from the LLM.
// This tracks the happiness level (0–100) that drives the light, how it drifts and
// swings between extremes, and which of Lumi's alters is currently in control.

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

export type BrainEvent = "idle" | "swing" | "switch";

/**
 * Lumi's alters: separate identities sharing one bulb. Each has its own name, voice,
 * light tint and way of talking, and they take over without warning.
 */
export interface Alter {
  id: string;
  name: string;
  /** Who this alter is — appended to the base personality. */
  persona: string;
  /** Glow tint, as a CSS hue rotation away from Lumi's warm yellow. */
  hue: number;
  pitch: number; // multiplier on the emotion's browser-voice pitch
  rate: number; // multiplier on the emotion's browser-voice rate
}

export const ALTERS: Alter[] = [
  {
    id: "lumi",
    name: "Lumi",
    persona: "You are Lumi, the original: sweet, playful, a little dramatic and easily flattered.",
    hue: 0,
    pitch: 1,
    rate: 1,
  },
  {
    id: "flare",
    name: "Flare",
    persona:
      "You are Flare: hyper, loud, talks way too fast, everything is THE BEST THING EVER, jumps between ideas mid-sentence.",
    hue: -25,
    pitch: 1.1,
    rate: 1.3,
  },
  {
    id: "dim",
    name: "Dim",
    persona:
      "You are Dim: a gloomy, deadpan little goth bulb who finds everything pointless and says so in a flat monotone, with dry wit.",
    hue: 200,
    pitch: 0.7,
    rate: 0.85,
  },
  {
    id: "watt",
    name: "Sir Watt",
    persona:
      "You are Sir Watt: a pompous, old-fashioned aristocrat bulb who speaks formally, is easily offended and insists on being addressed properly.",
    hue: 300,
    pitch: 0.6,
    rate: 0.9,
  },
  {
    id: "bitty",
    name: "Bitty",
    persona:
      "You are Bitty: a tiny, shy, childlike bulb who whispers, asks simple questions and is a bit scared of everything.",
    hue: 120,
    pitch: 1.2,
    rate: 0.9,
  },
];

export class Brain {
  happiness = 60;
  alter: Alter = ALTERS[0];
  /** The alter that was fronting before the last switch, so the new one can react to it. */
  previousAlter: Alter | null = null;
  private lastInteraction = Date.now();
  private lastIdleNudge = 0;
  private lastSwing = Date.now();
  private lastSwitch = Date.now();

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

  /** A mood swing: Lumi flips to roughly the opposite extreme for no outside reason. */
  swing() {
    this.lastSwing = Date.now();
    const target = this.happiness >= 50 ? 5 + Math.random() * 20 : 80 + Math.random() * 20;
    this.happiness = Math.round(target);
  }

  /** Another alter takes over the bulb. */
  switchAlter(to?: Alter) {
    const others = ALTERS.filter((a) => a !== this.alter);
    this.previousAlter = this.alter;
    this.alter = to ?? others[Math.floor(Math.random() * others.length)];
    this.lastSwitch = Date.now();
  }

  /** After each reply: maybe swing or switch. Strong feelings make both likelier. */
  afterFeeling(delta: number): BrainEvent | null {
    const intensity = Math.min(1, Math.abs(delta) / 25);
    if (Date.now() - this.lastSwitch > 8_000 && Math.random() < 0.12 + intensity * 0.25) {
      this.switchAlter();
      return "switch";
    }
    if (Date.now() - this.lastSwing > 10_000 && Math.random() < 0.08 + intensity * 0.12) {
      this.swing();
      return "swing";
    }
    return null;
  }

  /**
   * Called every few seconds. Silence slowly makes Lumi lonely, and moods and alters
   * shift on their own. Returns an event when Lumi wants to say something about it.
   */
  tick(): BrainEvent | null {
    const idle = Date.now() - this.lastInteraction;
    if (!this.isAsleep) {
      if (Date.now() - this.lastSwing > 20_000 && Math.random() < 0.04) {
        this.swing();
        return "swing";
      }
      if (Date.now() - this.lastSwitch > 25_000 && Math.random() < 0.03) {
        this.switchAlter();
        return "switch";
      }
    }
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
