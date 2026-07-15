import { ChatOpenAI } from "@langchain/openai";

/**
 * DeepSeek chat model exposed through its OpenAI-compatible API. DeepSeek speaks
 * the OpenAI wire format, so LangChain's `ChatOpenAI` works unchanged once we
 * point it at DeepSeek's base URL. The instance is created lazily and reused for
 * every message handled by this bot process.
 *
 * Env:
 *   DEEPSEEK_API_KEY   (required) — your DeepSeek API key.
 *   DEEPSEEK_MODEL     (optional) — defaults to "deepseek-chat".
 *   DEEPSEEK_BASE_URL  (optional) — defaults to "https://api.deepseek.com".
 */
let instance: ChatOpenAI | null = null;

export function deepseek(): ChatOpenAI {
  if (!instance) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");
    instance = new ChatOpenAI({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      temperature: 0.2,
      apiKey,
      configuration: {
        baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      },
    });
  }
  return instance;
}
