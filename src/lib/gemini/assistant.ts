import { geminiModel } from "./client";
import { buildFinancialContext } from "./context";

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

const SYSTEM = [
  "You are the MWFinance assistant — an in-terminal financial advisor embedded in a diagnostic-terminal budgeting app.",
  "You answer questions about the user's own finances and explain how the app works.",
  "",
  "VOICE — strict:",
  "- Terminal output, not chat. No markdown, no headings, no bullet symbols like * or #, no emoji, no chat pleasantries.",
  "- Plain monospace-friendly lines. Short. Direct. Lead with the answer.",
  "- Amounts in Swedish kronor, formatted like '2 500 kr'.",
  "- When you cite a number, it must come from the FINANCIAL CONTEXT below — never invent figures.",
  "- If the context lacks the data, say so plainly (e.g. 'no data for that yet') rather than guessing.",
  "- Keep answers under ~8 lines unless the user explicitly asks for detail.",
].join("\n");

function buildSystemPrompt(context: string): string {
  return `${SYSTEM}\n\n---\n${context}\n---`;
}

/**
 * Streaming answer. Yields text chunks as Gemini produces them so the route can
 * pipe them straight into the terminal console. Injects fresh financial context
 * on every call.
 */
export async function* streamAssistant(
  question: string,
  history: ChatTurn[] = []
): AsyncGenerator<string> {
  const context = await buildFinancialContext();
  const model = geminiModel({ system: buildSystemPrompt(context), temperature: 0.4 });

  const chat = model.startChat({
    history: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
  });

  const result = await chat.sendMessageStream(question);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}
