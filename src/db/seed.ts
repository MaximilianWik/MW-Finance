import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// Standalone connection so the seed can run outside Next.js (tsx).
const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

// name, emoji, color, monthly budget (SEK, null = no budget)
const DEFAULTS: Array<{
  name: string;
  emoji: string;
  color: string;
  budget: string | null;
  sort: number;
}> = [
  { name: "Groceries", emoji: "🛒", color: "#4ade80", budget: "4000", sort: 10 },
  { name: "Restaurants", emoji: "🍕", color: "#fbbf24", budget: "1500", sort: 20 },
  { name: "Transport", emoji: "🚇", color: "#38bdf8", budget: "900", sort: 30 },
  { name: "Shopping", emoji: "🛍️", color: "#f472b6", budget: "1500", sort: 40 },
  { name: "Bills & Utilities", emoji: "🧾", color: "#a78bfa", budget: "3000", sort: 50 },
  { name: "Entertainment", emoji: "🎬", color: "#fb7185", budget: "600", sort: 60 },
  { name: "Health", emoji: "💊", color: "#34d399", budget: "500", sort: 70 },
  { name: "Cash & ATM", emoji: "💵", color: "#94a3b8", budget: null, sort: 80 },
  { name: "Income", emoji: "💰", color: "#22c55e", budget: null, sort: 90 },
  { name: "Transfers", emoji: "🔁", color: "#64748b", budget: null, sort: 100 },
  { name: "Uncategorized", emoji: "❓", color: "#8a97a6", budget: null, sort: 999 },
];

async function main() {
  console.log("Seeding categories…");
  for (const c of DEFAULTS) {
    await db
      .insert(schema.categories)
      .values({
        name: c.name,
        emoji: c.emoji,
        color: c.color,
        budgetMonthly: c.budget,
        sort: c.sort,
      })
      .onConflictDoUpdate({
        target: schema.categories.name,
        set: { emoji: c.emoji, color: c.color, sort: c.sort },
      });
    console.log(`  ✓ ${c.emoji} ${c.name}`);
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.categories);
  console.log(`Done. ${count} categories total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
