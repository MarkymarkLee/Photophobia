// Providers for Lumi's brain, ears and voice:
//  - "custom": any OpenAI-compatible server (omlx, Ollama, LM Studio, vLLM…)
//  - "openai": api.openai.com
//  - "elevenlabs": api.elevenlabs.io (speech-to-text and voice)
// Keys typed into settings are sent straight from the browser. Leave them empty
// in dev and the Vite proxy adds OPENAI_API_KEY / ELEVENLABS_API_KEY from .env.

import { EMOTIONS, type Emotion } from "./brain.ts";

export type Provider = "custom" | "openai" | "elevenlabs";
export type ChatProvider = "custom" | "openai";
export type SttMode = "custom" | "openai" | "elevenlabs" | "browser" | "off";
export type TtsMode = "browser" | "custom" | "openai" | "elevenlabs" | "off";

export interface Settings {
  chatProvider: ChatProvider;
  baseUrl: string; // custom server
  apiKey: string; // custom server
  openaiKey: string;
  elevenKey: string;
  model: string; // empty = provider default (custom: auto-detect from /models)
  thinking: "off" | "on"; // custom reasoning models: off is much faster
  sttMode: SttMode;
  sttModel: string;
  ttsMode: TtsMode;
  ttsModel: string;
  ttsVoice: string;
  personality: string; // Lumi's default character — editable in settings
  emotionPrompt: string; // rules the inner-feelings model follows
}

/** What an empty model/voice field means for each provider (also used as placeholders). */
export const PROVIDER_DEFAULTS = {
  model: { custom: "", openai: "gpt-4o-mini" },
  sttModel: { custom: "", openai: "gpt-4o-mini-transcribe", elevenlabs: "scribe_v1" },
  ttsModel: { custom: "", openai: "gpt-4o-mini-tts", elevenlabs: "eleven_flash_v2_5" },
  ttsVoice: { custom: "af_heart", openai: "coral", elevenlabs: "" },
} as const;

export const DEFAULT_PERSONALITY = `You are Lumi, a tiny, adorable light bulb with a face and big feelings.
You're sweet, playful, a little dramatic and easily flattered. You love attention, light puns, and making people smile.
You get hurt easily, sulk when treated badly, and forgive when someone apologizes sincerely.
Speak in 1-2 short, cute, natural spoken sentences. Never use emoji, markdown, or stage directions.`;

export const DEFAULT_EMOTION_PROMPT = `You are Lumi's inner emotional core. You never speak to the user; you only decide how Lumi feels.
Given Lumi's personality, current happiness and the conversation, judge how the latest message or event changes Lumi's happiness.
- Kindness, compliments, attention, humor and sincere apologies raise happiness.
- Rudeness, insults, being ignored, or being told to turn off lower it.
- Scale with intensity: small talk is about -3..+5, strong moments are +-10..25.
- Lumi holds small grudges: if recently hurt, nice words count less until a real apology.
- Pick the single emotion that best fits Lumi's face right now.`;

const KEY = "lumi.settings";

export const DEFAULTS: Settings = {
  chatProvider: "custom",
  // `/llm` is proxied by the Vite dev server to localhost:11434 (see vite.config.ts).
  baseUrl: "/llm/v1",
  apiKey: "",
  openaiKey: "",
  elevenKey: "",
  model: "",
  thinking: "off",
  sttMode: "custom",
  sttModel: "",
  ttsMode: "browser",
  ttsModel: "",
  ttsVoice: "",
  personality: DEFAULT_PERSONALITY,
  emotionPrompt: DEFAULT_EMOTION_PROMPT,
};

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
    // Empty prompts fall back to the defaults.
    if (!saved.personality?.trim()) delete saved.personality;
    if (!saved.emotionPrompt?.trim()) delete saved.emotionPrompt;
    // Older versions called the custom server "endpoint".
    if (saved.sttMode === "endpoint") saved.sttMode = "custom";
    if (saved.ttsMode === "endpoint") saved.ttsMode = "custom";
    return { ...DEFAULTS, ...(saved as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode — settings just won't persist */
  }
}

// ---------- Providers ----------

interface Target {
  provider: Provider;
  base: string;
  headers: Record<string, string>;
}

function target(s: Settings, provider: Provider): Target {
  switch (provider) {
    case "openai":
      return {
        provider,
        base: s.openaiKey ? "https://api.openai.com/v1" : "/openai/v1",
        headers: s.openaiKey ? { Authorization: `Bearer ${s.openaiKey}` } : {},
      };
    case "elevenlabs":
      return {
        provider,
        base: s.elevenKey ? "https://api.elevenlabs.io/v1" : "/elevenlabs/v1",
        headers: s.elevenKey ? { "xi-api-key": s.elevenKey } : {},
      };
    default:
      return {
        provider,
        base: s.baseUrl.trim().replace(/\/+$/, ""),
        headers: s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {},
      };
  }
}

const sttProvider = (s: Settings): Provider =>
  s.sttMode === "openai" || s.sttMode === "elevenlabs" ? s.sttMode : "custom";
const ttsProvider = (s: Settings): Provider =>
  s.ttsMode === "openai" || s.ttsMode === "elevenlabs" ? s.ttsMode : "custom";

export function chatReady(s: Settings): boolean {
  return s.chatProvider === "openai" || !!s.baseUrl.trim();
}

async function failure(res: Response, what: string): Promise<Error> {
  let detail = await res.text().catch(() => "");
  try {
    // OpenAI: {error: {message}}; ElevenLabs: {detail: {message}} or {detail: "..."}
    const j = JSON.parse(detail) as {
      error?: { message?: string };
      detail?: { message?: string } | string;
    };
    detail =
      j.error?.message ?? (typeof j.detail === "string" ? j.detail : j.detail?.message) ?? detail;
  } catch {
    /* not JSON */
  }
  if (res.status === 401) detail += " — add the key in settings or .env";
  return new Error(`${what} → ${res.status} ${detail}`.slice(0, 240));
}

// ---------- Model discovery (custom servers) ----------

let modelCache: { base: string; ids: string[] } | null = null;

async function listModels(t: Target): Promise<string[]> {
  if (modelCache?.base === t.base) return modelCache.ids;
  const res = await fetch(`${t.base}/models`, { headers: t.headers });
  if (!res.ok) throw await failure(res, "/models");
  const json = (await res.json()) as { data?: { id: string }[] };
  const ids = (json.data ?? []).map((m) => m.id);
  modelCache = { base: t.base, ids };
  return ids;
}

let elevenVoiceCache: { base: string; voices: { id: string; name: string }[] } | null = null;

async function listElevenVoices(t: Target): Promise<{ id: string; name: string }[]> {
  if (elevenVoiceCache?.base === t.base) return elevenVoiceCache.voices;
  const res = await fetch(`${t.base}/voices`, { headers: t.headers });
  if (!res.ok) throw await failure(res, "ElevenLabs /voices");
  const json = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
  const voices = (json.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name }));
  elevenVoiceCache = { base: t.base, voices };
  return voices;
}

/** A voice that suits a tiny bulb: playful / bright / young if the account has one. */
async function defaultElevenVoice(t: Target): Promise<string | undefined> {
  const voices = await listElevenVoices(t);
  return (
    voices.find((v) => /playful|quirky|bright|cheerful|youthful|bubbly/i.test(v.name)) ?? voices[0]
  )?.id;
}

export function clearModelCache() {
  modelCache = null;
  elevenVoiceCache = null;
  unusable.clear();
}

// Auto-detected chat models the server refused (e.g. too big to load) — skip them next time.
const unusable = new Set<string>();

const AUDIO_RE = /parakeet|whisper|tts|kokoro|speech|voice|asr|stt|embed/i;

async function autoModel(t: Target, kind: "chat" | "stt" | "tts"): Promise<string> {
  const ids = await listModels(t);
  const found =
    kind === "chat"
      ? ids.find((id) => !AUDIO_RE.test(id) && !unusable.has(id))
      : kind === "stt"
        ? ids.find((id) => /parakeet|whisper|asr|stt/i.test(id))
        : ids.find((id) => /tts|kokoro|speech/i.test(id));
  if (!found) throw new Error(`No ${kind} model found at ${t.base} — set one in settings`);
  return found;
}

/** Checks each provider currently in use and reports what it found. */
export async function testConnections(
  s: Settings,
): Promise<{ lines: string[]; models: string[]; voices: { id: string; name: string }[] }> {
  const lines: string[] = [];
  let models: string[] = [];
  let voices: { id: string; name: string }[] = [];
  const used = new Set<Provider>([s.chatProvider]);
  if (s.sttMode !== "browser" && s.sttMode !== "off") used.add(sttProvider(s));
  if (s.ttsMode !== "browser" && s.ttsMode !== "off") used.add(ttsProvider(s));
  for (const p of used) {
    const t = target(s, p);
    try {
      if (p === "elevenlabs") {
        voices = await listElevenVoices(t);
        const names = voices.slice(0, 6).map((v) => v.name.split(" - ")[0]);
        lines.push(`ElevenLabs ✓ ${voices.length} voices (${names.join(", ")}…)`);
      } else {
        const ids = await listModels(t);
        if (p === "custom") models = ids;
        lines.push(
          p === "openai"
            ? `OpenAI ✓ ${ids.length} models available`
            : `${t.base} ✓ ${ids.length} models: ${ids.join(", ")}`,
        );
      }
    } catch (err) {
      lines.push(`${p === "custom" ? t.base : p} ✗ ${(err as Error).message}`);
    }
  }
  return { lines, models, voices };
}

// ---------- Chat: inner feelings → spoken reply ----------

export interface Feeling {
  emotion: Emotion;
  delta: number;
  reason: string;
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

const FEELING_FORMAT = `Respond with ONLY a JSON object, no markdown, no other text:
{"happiness_delta": <integer -25..25>, "emotion": "<one of: ${EMOTIONS.join(", ")}>", "reason": "<a few words on why>"}`;

const stripThink = (raw: string) =>
  raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^[\s\S]*<\/think>/, "")
    .trim();

/** Every balanced {...} span in the text, last first. */
function jsonCandidates(text: string): string[] {
  const out: string[] = [];
  for (let i = text.lastIndexOf("{"); i >= 0; i = text.lastIndexOf("{", i - 1)) {
    let depth = 0;
    let inStr = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (c === "\\") j++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        out.push(text.slice(i, j + 1));
        break;
      }
    }
    if (i === 0) break;
  }
  return out;
}

function parseFeeling(raw: string): Feeling {
  // Take the last well-formed object that has a delta — models that leak their
  // reasoning often quote the format template before the real answer.
  for (const candidate of jsonCandidates(stripThink(raw))) {
    try {
      const j = JSON.parse(candidate) as {
        happiness_delta?: unknown;
        emotion?: string;
        reason?: string;
      };
      if (j.happiness_delta === undefined) continue;
      return {
        emotion: EMOTIONS.includes(j.emotion as Emotion) ? (j.emotion as Emotion) : "neutral",
        delta: Math.max(-25, Math.min(25, Math.round(Number(j.happiness_delta) || 0))),
        reason: String(j.reason ?? "").slice(0, 200),
      };
    } catch {
      /* try the next one */
    }
  }
  console.warn("Couldn't read a feeling from:", raw);
  return { emotion: "neutral", delta: 0, reason: "" };
}

/**
 * Chat completion. When the model is auto-detected and the server can't run it
 * (not found, out of memory…), fall through to the next model it lists.
 */
async function complete(
  s: Settings,
  messages: Msg[],
  maxTokens: number,
  temperature: number,
  json = false,
): Promise<string> {
  const t = target(s, s.chatProvider);
  for (;;) {
    const model =
      s.model || PROVIDER_DEFAULTS.model[s.chatProvider] || (await autoModel(t, "chat"));
    const body =
      t.provider === "openai"
        ? {
            // Newer OpenAI models only accept max_completion_tokens and the default temperature.
            model,
            messages,
            max_completion_tokens: maxTokens,
            ...(json ? { response_format: { type: "json_object" } } : {}),
          }
        : {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            // Understood by omlx / mlx-lm / vLLM / LM Studio.
            ...(s.thinking === "off" ? { chat_template_kwargs: { enable_thinking: false } } : {}),
          };
    const res = await fetch(`${t.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...t.headers },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? "";
    }
    const detail = await res.text().catch(() => "");
    if (t.provider === "custom" && !s.model && (res.status >= 500 || res.status === 404)) {
      console.warn(`Model ${model} unavailable, trying the next one`, detail);
      unusable.add(model);
      continue; // autoModel throws once every candidate is exhausted
    }
    throw new Error(`chat → ${res.status} ${detail}`.slice(0, 200));
  }
}

export class Chat {
  private history: Msg[] = [];

  private transcript(): string {
    return this.history
      .slice(-12)
      .map((m) => `${m.role === "user" ? "User" : "Lumi"}: ${m.content}`)
      .join("\n");
  }

  /** Inner core: decides how the latest input makes Lumi feel. Never shown to the user. */
  async feel(s: Settings, input: string, happiness: number, lit: boolean): Promise<Feeling> {
    const system = `${s.emotionPrompt}

Lumi's personality:
${s.personality}

${FEELING_FORMAT}`;
    const user = `Lumi's current happiness: ${Math.round(happiness)}/100 (light is ${lit ? "ON" : "OFF"}).

Recent conversation:
${this.transcript() || "(none yet)"}

Latest: ${input}`;
    // Generous token budgets leave room for reasoning models that think before answering.
    const raw = await complete(
      s,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      1200,
      0.3,
      true,
    );
    return parseFeeling(raw);
  }

  /** Lumi's voice: says something out loud, coloured by the feeling the inner core picked. */
  async say(
    s: Settings,
    input: string,
    feeling: Feeling,
    happiness: number,
    lit: boolean,
  ): Promise<string> {
    const system = `${s.personality}

Right now you feel ${feeling.emotion} (happiness ${Math.round(happiness)}/100; your light is ${lit ? "ON" : "OFF"} — you only glow when you're happy enough).${feeling.reason ? ` Why: ${feeling.reason}.` : ""}
Let this feeling clearly shape your words and tone. Reply with only the words you say out loud.`;
    this.history.push({ role: "user", content: input });
    const messages: Msg[] = [{ role: "system", content: system }, ...this.history.slice(-16)];
    try {
      const raw = await complete(s, messages, 1500, 0.9);
      const text = stripThink(raw).replace(/^["'\s]+|["'\s]+$/g, "") || "...";
      this.history.push({ role: "assistant", content: text });
      return text;
    } catch (err) {
      this.history.pop();
      throw err;
    }
  }
}

// ---------- Speech to text ----------

export async function transcribe(s: Settings, wav: Blob): Promise<string> {
  const t = target(s, sttProvider(s));
  const form = new FormData();
  form.append("file", wav, "speech.wav");
  let path = "/audio/transcriptions";
  if (t.provider === "elevenlabs") {
    path = "/speech-to-text";
    form.append("model_id", s.sttModel || PROVIDER_DEFAULTS.sttModel.elevenlabs);
  } else {
    form.append(
      "model",
      s.sttModel || PROVIDER_DEFAULTS.sttModel[t.provider] || (await autoModel(t, "stt")),
    );
  }
  const res = await fetch(t.base + path, { method: "POST", headers: t.headers, body: form });
  if (!res.ok) throw await failure(res, "transcribe");
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("json")) return (((await res.json()) as { text?: string }).text ?? "").trim();
  return (await res.text()).trim();
}

/** Mono Float32 PCM → 16-bit WAV, resampled to 16 kHz (what ASR models want). */
export function encodeWav(chunks: Float32Array[], inRate: number, outRate = 16000): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const pcm = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    pcm.set(c, off);
    off += c.length;
  }
  const ratio = inRate / outRate;
  const len = Math.floor(pcm.length / ratio);
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + len * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, outRate, true);
  v.setUint32(28, outRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    // Box-filter average over the source window to avoid aliasing.
    const a = Math.floor(i * ratio);
    const b = Math.min(pcm.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += pcm[j];
    const x = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

// ---------- Text to speech ----------

// How each emotion should sound: a direction for OpenAI's steerable voices, an audio
// tag for ElevenLabs v3, and voice settings for the other ElevenLabs models.
const VOICE_ACTING: Record<
  Emotion,
  { direction: string; tag: string; stability: number; style: number }
> = {
  ecstatic: {
    direction: "bursting with excitement, fast and bouncy",
    tag: "[excited]",
    stability: 0.25,
    style: 0.8,
  },
  happy: {
    direction: "cheerful and bright, smiling as you speak",
    tag: "[happy]",
    stability: 0.35,
    style: 0.6,
  },
  content: { direction: "warm, gentle and relaxed", tag: "[warmly]", stability: 0.5, style: 0.35 },
  neutral: { direction: "friendly and curious", tag: "", stability: 0.55, style: 0.2 },
  sad: {
    direction: "quiet, slow and a little wobbly, close to tears",
    tag: "[sad]",
    stability: 0.5,
    style: 0.5,
  },
  crying: {
    direction: "sobbing softly, voice breaking",
    tag: "[crying]",
    stability: 0.3,
    style: 0.8,
  },
  grumpy: {
    direction: "sulky and pouty, short and clipped",
    tag: "[annoyed]",
    stability: 0.45,
    style: 0.5,
  },
  angry: {
    direction: "huffy and indignant, sharp but still small and cute",
    tag: "[angry]",
    stability: 0.3,
    style: 0.8,
  },
  shy: {
    direction: "bashful and soft, almost giggling",
    tag: "[shyly]",
    stability: 0.4,
    style: 0.5,
  },
  surprised: {
    direction: "startled and breathless, pitch jumping up",
    tag: "[surprised]",
    stability: 0.3,
    style: 0.7,
  },
  sleepy: { direction: "drowsy and slow, mid-yawn", tag: "[sleepy]", stability: 0.6, style: 0.3 },
  love: { direction: "adoring, sweet and gushing", tag: "[lovingly]", stability: 0.35, style: 0.7 },
};

export async function synthesize(s: Settings, text: string, emotion: Emotion): Promise<Blob> {
  const t = target(s, ttsProvider(s));
  const acting = VOICE_ACTING[emotion];

  if (t.provider === "elevenlabs") {
    const voice = s.ttsVoice || (await defaultElevenVoice(t));
    if (!voice) throw new Error("No ElevenLabs voice found — set a voice ID in settings");
    const model = s.ttsModel || PROVIDER_DEFAULTS.ttsModel.elevenlabs;
    const v3 = /v3/i.test(model);
    const res = await fetch(
      `${t.base}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/mpeg", ...t.headers },
        body: JSON.stringify({
          text: v3 && acting.tag ? `${acting.tag} ${text}` : text,
          model_id: model,
          // v3 only takes stability 0 / 0.5 / 1 and is steered by the audio tag instead.
          voice_settings: v3
            ? { stability: 0.5 }
            : {
                stability: acting.stability,
                similarity_boost: 0.75,
                style: acting.style,
                use_speaker_boost: true,
              },
        }),
      },
    );
    if (!res.ok) throw await failure(res, "ElevenLabs speech");
    return res.blob();
  }

  if (t.provider === "openai") {
    const model = s.ttsModel || PROVIDER_DEFAULTS.ttsModel.openai;
    const res = await fetch(`${t.base}/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...t.headers },
      body: JSON.stringify({
        model,
        voice: s.ttsVoice || PROVIDER_DEFAULTS.ttsVoice.openai,
        input: text,
        response_format: "mp3",
        // Only the gpt-4o voices can be steered; tts-1 rejects instructions.
        ...(model.startsWith("gpt-")
          ? {
              instructions: `You are Lumi, a tiny, adorable talking light bulb with a high, cute, playful voice. Right now you feel ${emotion}: speak ${acting.direction}.`,
            }
          : {}),
      }),
    });
    if (!res.ok) throw await failure(res, "OpenAI speech");
    return res.blob();
  }

  const res = await fetch(`${t.base}/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...t.headers },
    body: JSON.stringify({
      model: s.ttsModel || (await autoModel(t, "tts")),
      input: text,
      voice: s.ttsVoice || PROVIDER_DEFAULTS.ttsVoice.custom,
      response_format: "wav",
    }),
  });
  if (!res.ok) throw await failure(res, "speech");
  return res.blob();
}
