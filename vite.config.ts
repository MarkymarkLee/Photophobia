import { defineConfig, loadEnv } from "vite-plus";

// Dev proxies, so the browser never sees API keys and doesn't hit CORS:
//   /llm/*        → your local OpenAI-compatible server (omlx, Ollama…), key OMLX_API_KEY
//   /openai/*     → api.openai.com, key OPENAI_API_KEY
//   /elevenlabs/* → api.elevenlabs.io, key ELEVENLABS_API_KEY
// Keys come from .env. Override the local target with LLM_TARGET.
const env = loadEnv("development", ".", "");
const LLM_TARGET = env.LLM_TARGET || "http://localhost:11434";
const LLM_KEY = env.OMLX_API_KEY || env.LLM_API_KEY || "";

const proxy = (prefix: string, target: string, headers: Record<string, string>) => ({
  target,
  changeOrigin: true,
  rewrite: (path: string) => path.slice(prefix.length),
  headers,
});

export default defineConfig({
  server: {
    proxy: {
      "/llm": proxy("/llm", LLM_TARGET, LLM_KEY ? { Authorization: `Bearer ${LLM_KEY}` } : {}),
      "/openai": proxy(
        "/openai",
        "https://api.openai.com",
        env.OPENAI_API_KEY ? { Authorization: `Bearer ${env.OPENAI_API_KEY}` } : {},
      ),
      "/elevenlabs": proxy(
        "/elevenlabs",
        "https://api.elevenlabs.io",
        env.ELEVENLABS_API_KEY ? { "xi-api-key": env.ELEVENLABS_API_KEY } : {},
      ),
    },
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
