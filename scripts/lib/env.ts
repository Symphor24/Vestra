import { z } from "zod";

// Server/CI only. Fails fast with a readable message instead of a cryptic runtime error later.
const Env = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  ODDS_API_KEY: z.string().min(10),
  ODDS_API_MONTHLY_CREDIT_CAP: z.coerce.number().int().positive().default(470),
});

export type ScriptEnv = z.infer<typeof Env>;

export function loadEnv(): ScriptEnv {
  const r = Env.safeParse(process.env);
  if (!r.success) {
    const missing = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Variables d'environnement invalides :\n  ${missing}`);
  }
  return r.data;
}
