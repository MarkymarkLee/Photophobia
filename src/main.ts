import "./style.css";
import { Brain, type Emotion } from "./brain.ts";
import {
  Chat,
  DEFAULTS,
  DEFAULT_EMOTION_PROMPT,
  DEFAULT_PERSONALITY,
  PROVIDER_DEFAULTS,
  chatReady,
  clearModelCache,
  encodeWav,
  loadSettings,
  saveSettings,
  synthesize,
  testConnections,
  transcribe,
  type Settings,
} from "./llm.ts";

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

const MIC_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>`;
const GEAR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7 7 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7 7 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/></svg>`;

const GLASS =
  "M 145 450 C 145 395 40 345 40 235 A 160 160 0 1 1 360 235 C 360 345 255 395 255 450 Z";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="glow" aria-hidden="true"></div>
  <main class="stage">
    <div class="bubble hidden" id="bubble" aria-live="polite"><span id="bubble-text"></span></div>
    <div class="lumi-wrap" id="lumi-wrap">
      <svg id="lumi" viewBox="0 0 400 600" role="img" aria-label="Lumi, a light bulb with a face">
        <defs>
          <radialGradient id="glass-on" cx="45%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#fffef6"/>
            <stop offset="50%" stop-color="#ffec8f"/>
            <stop offset="100%" stop-color="#ffc23d"/>
          </radialGradient>
          <radialGradient id="glass-off" cx="45%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#5b6377"/>
            <stop offset="100%" stop-color="#2a2f3d"/>
          </radialGradient>
          <linearGradient id="metal" x1="0" x2="1">
            <stop offset="0%" stop-color="#8d93a0"/>
            <stop offset="45%" stop-color="#e3e6ec"/>
            <stop offset="100%" stop-color="#7c818d"/>
          </linearGradient>
        </defs>
        <g class="bulb" id="bulb">
          <path class="glass-off" d="${GLASS}" fill="url(#glass-off)"/>
          <path class="glass-on" d="${GLASS}" fill="url(#glass-on)"/>
          <path class="glass-rim" d="${GLASS}"/>
          <path class="shine" d="M 92 200 Q 98 128 160 98"/>
          <g class="base">
            <rect x="138" y="446" width="124" height="24" rx="9" fill="url(#metal)"/>
            <rect x="146" y="472" width="108" height="16" rx="8" fill="url(#metal)"/>
            <rect x="148" y="491" width="104" height="16" rx="8" fill="url(#metal)"/>
            <rect x="152" y="510" width="96" height="16" rx="8" fill="url(#metal)"/>
            <path d="M 170 529 L 230 529 L 215 552 Q 200 562 185 552 Z" fill="#4a4f5c"/>
          </g>
          <g class="face" id="face">
            <ellipse class="cheek" id="cheek-l" cx="108" cy="268" rx="24" ry="13"/>
            <ellipse class="cheek" id="cheek-r" cx="292" cy="268" rx="24" ry="13"/>
            <path class="brow" id="brow-l"/>
            <path class="brow" id="brow-r"/>
            <path class="feature" id="eye-l"/>
            <path class="feature" id="eye-r"/>
            <circle class="hl" id="hl-l"/>
            <circle class="hl" id="hl-r"/>
            <path class="feature" id="mouth"/>
            <path class="tear" d="M 150 250 q -9 16 0 22 q 9 -6 0 -22 Z"/>
            <path class="tear late" d="M 250 250 q -9 16 0 22 q 9 -6 0 -22 Z"/>
          </g>
        </g>
      </svg>
    </div>
    <div class="particles" id="particles" aria-hidden="true"></div>
  </main>
  <footer class="controls">
    <div class="status" id="status">Tap the mic for hands-free chat</div>
    <form class="chat" id="chat" autocomplete="off">
      <button type="button" class="mic" id="mic" aria-label="Start talking">${MIC_ICON}</button>
      <input id="text" placeholder="Say something to Lumi…" aria-label="Message to Lumi"/>
      <button type="submit" class="send">Send</button>
    </form>
  </footer>
  <button class="gear" id="gear" aria-label="Settings">${GEAR_ICON}</button>
  <div class="debug" id="debug" hidden></div>

  <dialog id="settings">
    <form method="dialog" id="settings-form">
      <h2>Lumi's brain</h2>
      <fieldset>
        <legend>Thinking (chat model)</legend>
        <label>Provider<select name="chatProvider">
          <option value="custom">Custom OpenAI-compatible server</option>
          <option value="openai">OpenAI</option>
        </select></label>
        <p class="hint" data-when="chatProvider=custom">omlx, Ollama, LM Studio, vLLM… <code>/llm/v1</code> is proxied by the dev server to <code>localhost:11434</code>.</p>
        <label data-when="chatProvider=custom">Base URL<input name="baseUrl" placeholder="http://localhost:11434/v1"/></label>
        <label data-when="chatProvider=custom">API key<input name="apiKey" type="password" placeholder="optional — or OMLX_API_KEY in .env"/></label>
        <label>Model<input name="model" list="models"/></label>
        <label data-when="chatProvider=custom">Model thinking<select name="thinking">
          <option value="off">Off (fast replies)</option>
          <option value="on">On (slower, for reasoning models)</option>
        </select></label>
      </fieldset>
      <fieldset>
        <legend>API keys</legend>
        <p class="hint">Leave empty in dev to use <code>OPENAI_API_KEY</code> / <code>ELEVENLABS_API_KEY</code> from <code>.env</code> through the dev proxy (keys stay out of the browser). Keys typed here are stored in this browser and sent directly.</p>
        <label>OpenAI<input name="openaiKey" type="password" placeholder="sk-… (optional)"/></label>
        <label>ElevenLabs<input name="elevenKey" type="password" placeholder="optional"/></label>
      </fieldset>
      <fieldset>
        <legend>Personality <button type="button" class="link" data-reset="personality">reset</button></legend>
        <p class="hint">Who Lumi is and how it talks. Everything Lumi says is generated from this.</p>
        <textarea name="personality" rows="6"></textarea>
      </fieldset>
      <fieldset>
        <legend>Inner feelings <button type="button" class="link" data-reset="emotionPrompt">reset</button></legend>
        <p class="hint">A separate internal model reads each message and decides how much happier or sadder Lumi gets (which turns the light on and off). It never speaks.</p>
        <textarea name="emotionPrompt" rows="7"></textarea>
      </fieldset>
      <fieldset>
        <legend>Listening (speech-to-text)</legend>
        <label>Provider<select name="sttMode">
          <option value="custom">Custom server /audio/transcriptions</option>
          <option value="openai">OpenAI</option>
          <option value="elevenlabs">ElevenLabs Scribe</option>
          <option value="browser">Browser speech recognition</option>
          <option value="off">Off (type only)</option>
        </select></label>
        <label data-when="sttMode=custom,openai,elevenlabs">Model<input name="sttModel" list="models"/></label>
      </fieldset>
      <fieldset>
        <legend>Voice (text-to-speech)</legend>
        <label>Provider<select name="ttsMode">
          <option value="browser">Browser voice</option>
          <option value="elevenlabs">ElevenLabs</option>
          <option value="openai">OpenAI</option>
          <option value="custom">Custom server /audio/speech</option>
          <option value="off">Silent</option>
        </select></label>
        <label data-when="ttsMode=custom,openai,elevenlabs">Model<input name="ttsModel" list="models"/></label>
        <label data-when="ttsMode=custom,openai,elevenlabs">Voice<input name="ttsVoice" list="voices"/></label>
      </fieldset>
      <datalist id="models"></datalist>
      <datalist id="voices"></datalist>
      <p class="hint" id="models-result"></p>
      <div class="row">
        <button type="button" id="fetch-models">Test connections</button>
        <span class="spacer"></span>
        <button value="cancel" formnovalidate>Cancel</button>
        <button value="save" class="primary">Save</button>
      </div>
    </form>
  </dialog>
`;

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const bubble = $<HTMLDivElement>("#bubble");
const bubbleText = $<HTMLSpanElement>("#bubble-text");
const statusEl = $<HTMLDivElement>("#status");
const micBtn = $<HTMLButtonElement>("#mic");
const textInput = $<HTMLInputElement>("#text");
const svg = $<SVGSVGElement>("#lumi");
const wrap = $<HTMLDivElement>("#lumi-wrap");
const face = $<SVGGElement>("#face");
const particles = $<HTMLDivElement>("#particles");
const debugEl = $<HTMLDivElement>("#debug");
const dialog = $<HTMLDialogElement>("#settings");
const settingsForm = $<HTMLFormElement>("#settings-form");

const el = {
  eyeL: $<SVGPathElement>("#eye-l"),
  eyeR: $<SVGPathElement>("#eye-r"),
  hlL: $<SVGCircleElement>("#hl-l"),
  hlR: $<SVGCircleElement>("#hl-r"),
  browL: $<SVGPathElement>("#brow-l"),
  browR: $<SVGPathElement>("#brow-r"),
  mouth: $<SVGPathElement>("#mouth"),
  cheekL: $<SVGEllipseElement>("#cheek-l"),
  cheekR: $<SVGEllipseElement>("#cheek-r"),
};

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

// Eyes and mouth share one shape: two cubic curves between left/right corners.
// t = how far the top edge bulges up, b = how far the bottom edge bulges down.
// Negative values flip the bulge, which gives crescents (^ ^), frowns, etc.
interface Expr {
  eyeW: number;
  eyeT: number;
  eyeB: number;
  mouthW: number;
  mouthT: number;
  mouthB: number;
  browIn: number;
  browOut: number;
  browOp: number;
  cheek: number;
}

const E = (
  eye: [number, number, number],
  mouth: [number, number, number],
  brow: [number, number, number],
  cheek: number,
): Expr => ({
  eyeW: eye[0],
  eyeT: eye[1],
  eyeB: eye[2],
  mouthW: mouth[0],
  mouthT: mouth[1],
  mouthB: mouth[2],
  browIn: brow[0],
  browOut: brow[1],
  browOp: brow[2],
  cheek,
});

const NO_BROW: [number, number, number] = [0, 0, 0];
const EXPRESSIONS: Record<Emotion, Expr> = {
  ecstatic: E([20, 28, -14], [46, -10, 58], NO_BROW, 0.9),
  happy: E([18, 24, -12], [38, -8, 42], NO_BROW, 0.7),
  content: E([14, 19, 19], [30, -14, 22], NO_BROW, 0.4),
  neutral: E([14, 19, 19], [18, 0, 3], NO_BROW, 0.1),
  sad: E([13, 15, 19], [26, 20, -12], [-10, 6, 1], 0),
  crying: E([17, 23, 23], [30, 26, 4], [-12, 6, 1], 0),
  grumpy: E([15, 4, 18], [22, 8, -3], [8, -2, 1], 0),
  angry: E([14, 10, 18], [28, 18, -2], [14, -6, 1], 0),
  shy: E([13, 18, -9], [14, -6, 14], NO_BROW, 1),
  surprised: E([19, 26, 26], [18, 26, 26], [-14, -14, 1], 0.2),
  sleepy: E([16, -3, 5], [12, -2, 8], NO_BROW, 0.2),
  love: E([18, 24, -12], [36, -8, 38], NO_BROW, 1),
};

const shape = (cx: number, cy: number, w: number, t: number, b: number) =>
  `M ${cx - w} ${cy} C ${cx - w} ${cy - t} ${cx + w} ${cy - t} ${cx + w} ${cy} ` +
  `C ${cx + w} ${cy + b} ${cx - w} ${cy + b} ${cx - w} ${cy} Z`;

const EYE_Y = 225;
const MOUTH_Y = 298;
const BROW_Y = 183;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const brain = new Brain();
const chat = new Chat();
let settings: Settings = loadSettings();

let reaction: Emotion | null = "happy";
let reactionUntil = performance.now() + 4000;
let lit = brain.happiness >= 40;
let brightness = 0;
let flickerUntil = 0;
let busy = false; // thinking or transcribing
let speaking = false;
let talkAmp = 0;
let talkAnalyser: AnalyserNode | null = null;
let hasInteracted = false;

const cur: Expr = { ...EXPRESSIONS.happy };
const gaze = { x: 0, y: 0, tx: 0, ty: 0 };
let lastPointer = 0;
let blinkStart = 0;
let nextBlink = performance.now() + 2500;

function currentEmotion(now: number): Emotion {
  if (busy && !speaking) return "neutral";
  if (reaction && now < reactionUntil) return reaction;
  reaction = null;
  return brain.mood();
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

let lastEmotion: Emotion | null = null;
let lastFrame = performance.now();

function frame(now: number) {
  // Frame-rate independent easing: `ease(k)` behaves like `* k` per 60fps frame.
  const dt = Math.min(500, now - lastFrame) / (1000 / 60);
  lastFrame = now;
  const ease = (k: number) => 1 - Math.pow(1 - k, dt);
  const emotion = currentEmotion(now);
  const target = EXPRESSIONS[emotion];
  for (const k of Object.keys(cur) as (keyof Expr)[]) cur[k] += (target[k] - cur[k]) * ease(0.16);

  if (emotion !== lastEmotion) {
    wrap.dataset.emotion = emotion;
    lastEmotion = emotion;
  }

  // Blink
  if (now > nextBlink) {
    blinkStart = now;
    nextBlink = now + 2200 + Math.random() * 3800;
  }
  const bt = (now - blinkStart) / 140;
  const blink = bt < 1 ? Math.sin(bt * Math.PI) : 0;
  const eyeOpen = 1 - blink * 0.92;

  // Talking: real amplitude when we have an analyser, synthetic wobble otherwise.
  if (speaking) {
    if (talkAnalyser) {
      const data = new Uint8Array(talkAnalyser.fftSize);
      talkAnalyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      talkAmp += (Math.min(1, Math.sqrt(sum / data.length) * 5) - talkAmp) * ease(0.5);
    } else {
      const wobble = 0.5 + 0.5 * Math.sin(now / 55) * Math.sin(now / 137 + 1);
      talkAmp += (wobble - talkAmp) * ease(0.4);
    }
  } else {
    talkAmp *= 1 - ease(0.2);
  }

  // Gaze follows pointer, or wanders when idle.
  if (now - lastPointer > 3500 && Math.random() < 0.01) {
    gaze.tx = (Math.random() - 0.5) * 1.2;
    gaze.ty = (Math.random() - 0.5) * 0.8;
  }
  gaze.x += (gaze.tx - gaze.x) * ease(0.08);
  gaze.y += (gaze.ty - gaze.y) * ease(0.08);
  face.setAttribute("transform", `translate(${gaze.x * 14} ${gaze.y * 10})`);

  const eyeT = cur.eyeT * eyeOpen;
  const eyeB = cur.eyeB * eyeOpen;
  el.eyeL.setAttribute("d", shape(150, EYE_Y, cur.eyeW, eyeT, eyeB));
  el.eyeR.setAttribute("d", shape(250, EYE_Y, cur.eyeW, eyeT, eyeB));

  const hlOn = cur.eyeT > 14 && cur.eyeB > 14 && blink < 0.4;
  for (const [hl, cx] of [
    [el.hlL, 150],
    [el.hlR, 250],
  ] as const) {
    hl.setAttribute("cx", String(cx + cur.eyeW * 0.35));
    hl.setAttribute("cy", String(EYE_Y - cur.eyeT * 0.38));
    hl.setAttribute("r", String(cur.eyeW * 0.3));
    hl.style.opacity = hlOn ? "1" : "0";
  }

  const mT = cur.mouthT + (speaking ? talkAmp * 6 : 0);
  const mB = cur.mouthB + (speaking ? talkAmp * 26 : 0);
  el.mouth.setAttribute("d", shape(200, MOUTH_Y, cur.mouthW, mT, mB));

  const brow = (x1: number, x2: number, outer: number, inner: number) =>
    `M ${x1} ${BROW_Y + outer} Q ${(x1 + x2) / 2} ${BROW_Y + (outer + inner) / 2 - 5} ${x2} ${BROW_Y + inner}`;
  el.browL.setAttribute("d", brow(126, 172, cur.browOut, cur.browIn));
  el.browR.setAttribute("d", brow(274, 228, cur.browOut, cur.browIn));
  el.browL.style.opacity = el.browR.style.opacity = String(cur.browOp);
  el.cheekL.style.opacity = el.cheekR.style.opacity = String(cur.cheek * 0.85);

  // Light: hysteresis so it doesn't flap around the threshold.
  const h = brain.happiness;
  const nowLit = lit ? h >= 30 : h >= 40;
  if (nowLit !== lit) {
    lit = nowLit;
    flickerUntil = now + 900;
    document.body.classList.toggle("lit", lit);
  }
  const targetB = lit ? 0.4 + 0.6 * Math.min(1, (h - 30) / 65) : 0;
  brightness += (targetB - brightness) * ease(0.06);
  let shown = brightness;
  if (now < flickerUntil) shown = Math.random() < 0.45 ? (lit ? 0.1 : 0.7) : brightness;
  document.documentElement.style.setProperty("--b", shown.toFixed(3));

  if (!debugEl.hidden)
    debugEl.textContent = `happiness ${h.toFixed(1)} · ${emotion} · ${lit ? "on" : "off"}`;

  requestAnimationFrame(frame);
}

document.body.classList.toggle("lit", lit);
requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has("debug")) {
  debugEl.hidden = false;
  (window as unknown as { lumi: unknown }).lumi = {
    brain,
    setReaction: (e: Emotion) => ((reaction = e), (reactionUntil = performance.now() + 60_000)),
  };
}

window.addEventListener("pointermove", (e) => {
  const r = svg.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height * 0.4;
  gaze.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width * 0.8)));
  gaze.ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height * 0.6)));
  lastPointer = performance.now();
});

// ---------------------------------------------------------------------------
// Particles (hearts, sparkles, z's)
// ---------------------------------------------------------------------------

const PARTICLES: Partial<Record<Emotion, string[]>> = {
  love: ["♥", "♥", "♡"],
  ecstatic: ["✦", "✧", "★"],
  happy: ["✦", "✧"],
  shy: ["♡"],
  surprised: ["!"],
  angry: ["✕"],
};

function burst(emotion: Emotion, count = 7) {
  const glyphs = PARTICLES[emotion];
  if (!glyphs) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = `particle p-${emotion}`;
    p.textContent = glyphs[i % glyphs.length];
    p.style.left = `${30 + Math.random() * 40}%`;
    p.style.top = `${25 + Math.random() * 30}%`;
    p.style.setProperty("--dx", `${(Math.random() - 0.5) * 160}px`);
    p.style.animationDelay = `${i * 70}ms`;
    p.style.fontSize = `${18 + Math.random() * 22}px`;
    particles.append(p);
    setTimeout(() => p.remove(), 2600 + i * 70);
  }
}

setInterval(() => {
  if (currentEmotion(performance.now()) !== "sleepy") return;
  const z = document.createElement("span");
  z.className = "particle p-sleepy";
  z.textContent = "z";
  z.style.left = "62%";
  z.style.top = "22%";
  z.style.fontSize = `${20 + Math.random() * 16}px`;
  particles.append(z);
  setTimeout(() => z.remove(), 2600);
}, 1100);

// ---------------------------------------------------------------------------
// Audio plumbing
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function setStatus(text: string, kind: "" | "error" | "live" = "") {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

// ---------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------

const VOICE_STYLE: Record<Emotion, { pitch: number; rate: number }> = {
  ecstatic: { pitch: 1.9, rate: 1.15 },
  love: { pitch: 1.85, rate: 1.05 },
  happy: { pitch: 1.75, rate: 1.1 },
  content: { pitch: 1.6, rate: 1.0 },
  neutral: { pitch: 1.5, rate: 1.0 },
  shy: { pitch: 1.7, rate: 0.95 },
  surprised: { pitch: 1.9, rate: 1.15 },
  sad: { pitch: 1.25, rate: 0.85 },
  crying: { pitch: 1.2, rate: 0.8 },
  grumpy: { pitch: 1.05, rate: 0.95 },
  angry: { pitch: 0.95, rate: 1.1 },
  sleepy: { pitch: 1.2, rate: 0.75 },
};

function pickBrowserVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => /Samantha|Google US English|Aria|Jenny|Zira|Karen|Moira/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en"))
  );
}

function speakBrowser(text: string, emotion: Emotion): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const style = VOICE_STYLE[emotion];
    u.pitch = Math.min(2, style.pitch);
    u.rate = style.rate;
    const v = pickBrowserVoice();
    if (v) u.voice = v;
    // Chrome occasionally never fires onend; don't get stuck.
    const safety = setTimeout(resolve, 2000 + text.length * 110);
    u.onend = u.onerror = () => {
      clearTimeout(safety);
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

async function speakEndpoint(text: string, emotion: Emotion): Promise<void> {
  const blob = await synthesize(settings, text, emotion);
  const audio = new Audio(URL.createObjectURL(blob));
  const ac = ctx();
  const src = ac.createMediaElementSource(audio);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser).connect(ac.destination);
  talkAnalyser = analyser;
  await new Promise<void>((resolve) => {
    audio.onended = audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
  talkAnalyser = null;
  URL.revokeObjectURL(audio.src);
}

async function speak(text: string, emotion: Emotion) {
  speaking = true;
  try {
    if (settings.ttsMode !== "browser" && settings.ttsMode !== "off") {
      try {
        await speakEndpoint(text, emotion);
      } catch (err) {
        console.warn(`${settings.ttsMode} voice failed, using browser voice`, err);
        setStatus(`Voice failed: ${(err as Error).message.slice(0, 100)}`, "error");
        await speakBrowser(text, emotion);
      }
    } else if (settings.ttsMode === "browser" && hasInteracted) {
      await speakBrowser(text, emotion);
    } else {
      await new Promise((r) => setTimeout(r, 600 + text.length * 45));
    }
  } finally {
    speaking = false;
    talkAnalyser = null;
  }
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

interface Reply {
  text: string;
  emotion: Emotion;
}

function showBubble(text: string) {
  bubbleText.textContent = text;
  bubble.classList.remove("pop", "thinking", "hidden");
  void bubble.offsetWidth; // restart animation
  bubble.classList.add("pop");
}

async function react(reply: Reply) {
  reaction = reply.emotion;
  reactionUntil = performance.now() + 3500 + reply.text.length * 70;
  showBubble(reply.text);
  burst(reply.emotion);
  await speak(reply.text, reply.emotion);
  reactionUntil = Math.max(reactionUntil, performance.now() + 1800);
}

/**
 * One turn: the inner-feelings model decides the happiness change and emotion,
 * the brain applies it (which may switch the light), then the voice model speaks.
 */
async function converse(input: string) {
  if (busy) return;
  if (!chatReady(settings)) {
    setStatus("Lumi needs a brain — open settings and pick a chat provider", "error");
    return;
  }
  busy = true;
  bubble.classList.remove("hidden");
  bubble.classList.add("thinking");
  bubbleText.textContent = "";
  try {
    const feeling = await chat.feel(settings, input, brain.happiness, lit);
    brain.apply(feeling.delta);
    // Show the new feeling on the face while the reply is being written.
    reaction = feeling.emotion;
    reactionUntil = performance.now() + 30_000;
    const text = await chat.say(settings, input, feeling, brain.happiness, lit);
    busy = false;
    await react({ text, emotion: feeling.emotion });
  } catch (err) {
    busy = false;
    console.warn("LLM failed", err);
    bubble.classList.remove("thinking");
    bubble.classList.add("hidden");
    setStatus(`Can't reach Lumi's brain: ${(err as Error).message.slice(0, 120)}`, "error");
  }
}

function handleInput(text: string) {
  text = text.trim();
  if (!text || busy) return Promise.resolve();
  hasInteracted = true;
  setStatus(`You: “${text}”`);
  return converse(text);
}

$<HTMLFormElement>("#chat").addEventListener("submit", (e) => {
  e.preventDefault();
  ctx();
  const t = textInput.value;
  textInput.value = "";
  void handleInput(t);
});

svg.addEventListener("click", () => {
  if (busy || speaking) return;
  hasInteracted = true;
  ctx();
  void converse(
    brain.isAsleep
      ? "[event: you were dozing off and the user tapped your glass to wake you]"
      : "[event: the user poked you on the glass]",
  );
});

setInterval(() => {
  if (busy || speaking) return;
  if (brain.tick() === "idle" && hasInteracted) {
    void converse("[event: the user has gone quiet for a while and isn't talking to you]");
  }
}, 3000);

// Greet whoever opens the page (shown in the bubble; voice needs a click first).
void converse("[event: someone just opened the page and is looking at you for the first time]");

// ---------------------------------------------------------------------------
// Listening
// ---------------------------------------------------------------------------

let listening = false;
let stopListening: (() => void) | null = null;

/** Hands-free capture with a simple energy-based voice activity detector. */
async function startEndpointListening(): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ac = ctx();
  const src = ac.createMediaStreamSource(stream);
  const proc = ac.createScriptProcessor(2048, 1, 1);
  const mute = ac.createGain();
  mute.gain.value = 0;
  src.connect(proc).connect(mute).connect(ac.destination);

  const frameMs = (2048 / ac.sampleRate) * 1000;
  let noise = 0.01;
  let voiced = 0;
  let silentMs = 0;
  let recording = false;
  let chunks: Float32Array[] = [];
  const preroll: Float32Array[] = [];

  proc.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    micBtn.style.setProperty("--lvl", Math.min(1, rms * 12).toFixed(2));

    // Don't listen to ourselves, or while still processing the last utterance.
    if (busy || speaking) {
      recording = false;
      chunks = [];
      voiced = 0;
      return;
    }

    const copy = new Float32Array(input);
    const threshold = Math.max(0.012, noise * 3);
    if (!recording) {
      noise = noise * 0.97 + rms * 0.03;
      preroll.push(copy);
      if (preroll.length > 6) preroll.shift();
      voiced = rms > threshold ? voiced + 1 : 0;
      if (voiced >= 2) {
        recording = true;
        silentMs = 0;
        chunks = [...preroll];
        setStatus("Listening…", "live");
      }
      return;
    }

    chunks.push(copy);
    silentMs = rms > threshold * 0.8 ? 0 : silentMs + frameMs;
    const durMs = chunks.length * frameMs;
    if (silentMs > 850 || durMs > 15000) {
      recording = false;
      voiced = 0;
      const speechMs = durMs - silentMs;
      const captured = chunks;
      chunks = [];
      if (speechMs < 350) {
        setStatus("Listening — just talk to Lumi", "live");
        return;
      }
      void finishUtterance(encodeWav(captured, ac.sampleRate));
    }
  };

  setStatus("Listening — just talk to Lumi", "live");
  return () => {
    proc.onaudioprocess = null;
    src.disconnect();
    proc.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    micBtn.style.setProperty("--lvl", "0");
  };
}

async function finishUtterance(wav: Blob) {
  busy = true;
  setStatus("Hmm, let me hear that…", "live");
  try {
    const text = await transcribe(settings, wav);
    busy = false;
    if (text && /[a-z0-9]/i.test(text)) await handleInput(text);
    else setStatus("Didn't catch that — try again", "live");
  } catch (err) {
    busy = false;
    setStatus(`Transcription failed: ${(err as Error).message}`, "error");
  }
  if (listening)
    setTimeout(() => listening && !busy && setStatus("Listening — just talk to Lumi", "live"), 400);
}

// Minimal typing for the Web Speech API (not in every lib.dom version).
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  abort(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognizerCtor = new () => Recognizer;

function startBrowserListening(): () => void {
  const w = window as unknown as {
    SpeechRecognition?: RecognizerCtor;
    webkitSpeechRecognition?: RecognizerCtor;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor)
    throw new Error(
      "This browser has no speech recognition — use the endpoint mode or Chrome/Safari",
    );
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  let active = true;
  let running = false;

  const begin = () => {
    if (!active || running || busy || speaking) return;
    try {
      rec.start();
      running = true;
      setStatus("Listening — just talk to Lumi", "live");
    } catch {
      /* already started */
    }
  };
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) void handleInput(r[0].transcript);
      else interim += r[0].transcript;
    }
    if (interim) setStatus(`…${interim}`, "live");
  };
  rec.onend = () => {
    running = false;
  };
  rec.onerror = (e) => {
    running = false;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      active = false;
      void toggleListening(false);
      setStatus("Microphone permission denied", "error");
    }
  };
  // Restart recognition whenever Lumi is idle (it stops after each phrase).
  const timer = setInterval(begin, 300);
  begin();
  return () => {
    active = false;
    clearInterval(timer);
    rec.abort();
  };
}

async function toggleListening(on = !listening) {
  if (on === listening) return;
  stopListening?.();
  stopListening = null;
  listening = false;
  micBtn.classList.remove("on");
  micBtn.setAttribute("aria-label", "Start talking");
  if (!on) {
    setStatus("Mic off — tap to talk, or type");
    return;
  }
  try {
    if (settings.sttMode === "off") throw new Error("Listening is turned off in settings");
    stopListening =
      settings.sttMode === "browser" ? startBrowserListening() : await startEndpointListening();
    listening = true;
    hasInteracted = true;
    micBtn.classList.add("on");
    micBtn.setAttribute("aria-label", "Stop talking");
  } catch (err) {
    setStatus((err as Error).message, "error");
  }
}

micBtn.addEventListener("click", () => {
  ctx();
  void toggleListening();
});

// ---------------------------------------------------------------------------
// Settings dialog
// ---------------------------------------------------------------------------

const FIELDS = Object.keys(DEFAULTS) as (keyof Settings)[];

function fillForm(s: Settings) {
  for (const k of FIELDS) {
    const input = settingsForm.elements.namedItem(k) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
    if (input) input.value = s[k];
  }
}

function readForm(): Settings {
  const s = { ...settings } as Record<keyof Settings, string>;
  for (const k of FIELDS) {
    const input = settingsForm.elements.namedItem(k) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
    if (input) s[k] = input.value.trim();
  }
  return s as Settings;
}

const PROMPT_DEFAULTS = { personality: DEFAULT_PERSONALITY, emotionPrompt: DEFAULT_EMOTION_PROMPT };
settingsForm.querySelectorAll<HTMLButtonElement>("[data-reset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const k = btn.dataset.reset as keyof typeof PROMPT_DEFAULTS;
    (settingsForm.elements.namedItem(k) as HTMLTextAreaElement).value = PROMPT_DEFAULTS[k];
  });
});

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const field = (name: keyof Settings) => settingsForm.elements.namedItem(name) as Field;

/** Show only the fields relevant to the chosen providers and hint at their defaults. */
function updateDialog() {
  const value = (k: string) => field(k as keyof Settings).value;
  settingsForm.querySelectorAll<HTMLElement>("[data-when]").forEach((node) => {
    const [k, allowed] = node.dataset.when!.split("=");
    node.hidden = !allowed.split(",").includes(value(k));
  });
  const chat = value("chatProvider") as Settings["chatProvider"];
  const stt = value("sttMode");
  const tts = value("ttsMode");
  const ph = (defaults: Record<string, string>, p: string, auto: string) =>
    defaults[p] ? `default: ${defaults[p]}` : auto;
  (field("model") as HTMLInputElement).placeholder = ph(
    PROVIDER_DEFAULTS.model,
    chat,
    "auto-detect",
  );
  (field("sttModel") as HTMLInputElement).placeholder = ph(
    PROVIDER_DEFAULTS.sttModel,
    stt,
    "auto (parakeet / whisper)",
  );
  (field("ttsModel") as HTMLInputElement).placeholder = ph(
    PROVIDER_DEFAULTS.ttsModel,
    tts,
    "auto (kokoro / tts)",
  );
  (field("ttsVoice") as HTMLInputElement).placeholder =
    tts === "elevenlabs"
      ? "voice ID — default: a playful voice from your account"
      : ph(PROVIDER_DEFAULTS.ttsVoice, tts, "");
}

// Switching provider clears model/voice names that only made sense for the old one.
const DEPENDENTS: Partial<Record<keyof Settings, (keyof Settings)[]>> = {
  chatProvider: ["model"],
  sttMode: ["sttModel"],
  ttsMode: ["ttsModel", "ttsVoice"],
};
for (const [k, deps] of Object.entries(DEPENDENTS)) {
  field(k as keyof Settings).addEventListener("change", () => {
    for (const d of deps) field(d).value = "";
    updateDialog();
  });
}

$<HTMLButtonElement>("#gear").addEventListener("click", () => {
  fillForm(settings);
  updateDialog();
  $<HTMLParagraphElement>("#models-result").textContent = "";
  dialog.showModal();
});

$<HTMLButtonElement>("#fetch-models").addEventListener("click", async () => {
  const out = $<HTMLParagraphElement>("#models-result");
  clearModelCache();
  out.textContent = "Connecting…";
  const { lines, models, voices } = await testConnections(readForm());
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  $<HTMLDataListElement>("#models").innerHTML = models
    .map((id) => `<option value="${esc(id)}">`)
    .join("");
  $<HTMLDataListElement>("#voices").innerHTML = voices
    .map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`)
    .join("");
  out.textContent = lines.join("\n");
});

dialog.addEventListener("close", () => {
  if (dialog.returnValue !== "save") return;
  const wasListening = listening;
  const prevStt = settings.sttMode;
  settings = readForm();
  saveSettings(settings);
  clearModelCache();
  if (wasListening && prevStt !== settings.sttMode)
    void toggleListening(false).then(() => toggleListening(true));
  setStatus("Settings saved");
});
