import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";

/**
 * Shared Gemini model factory for the Phase 3 intelligence layer.
 *
 * `categorize.ts` keeps its own tightly-scoped JSON classifier; everything
 * conversational / analytical (assistant, budget recalibration, behavior
 * analysis) goes through here so the model + generation config stay
 * consistent.
 */
export function geminiModel(
  opts: { system?: string; json?: boolean; temperature?: number } = {}
) {
  const genAI = new GoogleGenerativeAI(env.gemini.apiKey);
  const generationConfig: {
    temperature: number;
    responseMimeType?: string;
  } = { temperature: opts.temperature ?? 0.4 };
  if (opts.json) generationConfig.responseMimeType = "application/json";
  return genAI.getGenerativeModel({
    model: env.gemini.model,
    systemInstruction: opts.system,
    generationConfig,
  });
}
