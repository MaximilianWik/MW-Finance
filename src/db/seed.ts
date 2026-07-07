import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// Standalone connection so the seed can run outside Next.js (tsx).
const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

// name, color, monthly budget, weekly budget (SEK, null = no budget)
const DEFAULTS: Array<{
  name: string;
  color: string;
  monthly: string | null;
  weekly: string | null;
  sort: number;
}> = [
  { name: "Groceries",       color: "#4ec96a", monthly: "4000", weekly: "1000", sort: 10 },
  { name: "Restaurants",     color: "#d4a843", monthly: "1500", weekly: "375",  sort: 20 },
  { name: "Transport",       color: "#5cc8e8", monthly: "900",  weekly: null,   sort: 30 },
  { name: "Shopping",        color: "#c080e0", monthly: "1500", weekly: null,   sort: 40 },
  { name: "Bills & Utilities",color: "#7080c8", monthly: "3000", weekly: null,  sort: 50 },
  { name: "Entertainment",   color: "#e06880", monthly: "600",  weekly: null,   sort: 60 },
  { name: "Health",          color: "#60c8a0", monthly: "500",  weekly: null,   sort: 70 },
  { name: "Cash & ATM",      color: "#8888a0", monthly: null,   weekly: null,   sort: 80 },
  { name: "Income",          color: "#4ec96a", monthly: null,   weekly: null,   sort: 90 },
  { name: "Transfers",       color: "#606070", monthly: null,   weekly: null,   sort: 100 },
  { name: "Uncategorized",   color: "#72728a", monthly: null,   weekly: null,   sort: 999 },
];

async function main() {
  console.log("Seeding categories…");
  for (const c of DEFAULTS) {
    await db
      .insert(schema.categories)
      .values({
        name: c.name,
        color: c.color,
        budgetMonthly: c.monthly,
        budgetWeekly: c.weekly,
        sort: c.sort,
      })
      .onConflictDoUpdate({
        target: schema.categories.name,
        set: { color: c.color, sort: c.sort },
      });
    console.log(`  [OK] ${c.name}`);
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
