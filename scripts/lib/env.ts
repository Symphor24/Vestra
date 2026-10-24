import { z } from "zod";

// Server/CI only. Fails fast with a readable message instead of a cryptic runtime error later.
export const DbEnv = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export const IngestEnv = DbEnv.extend({
  ODDS_API_KEY: z.string().min(10),
  ODDS_API_MONTHLY_CREDIT_CAP: z.coerce.number().int().positive().default(470),
});

export const ResultsEnv = DbEnv.extend({
  FOOTBALL_DATA_API_KEY: z.string().min(10),
});

export function loadEnv<S extends z.ZodType>(schema: S): z.infer<S> {
  const r = schema.safeParse(process.env);
  if (!r.success) {
    const missing = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Variables d'environnement invalides :\n  ${missing}`);
  }
  return r.data;
}
