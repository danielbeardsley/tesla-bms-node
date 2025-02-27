import { z } from "zod";

const ConfigSchema = z.object({
   // Number of modules in the pack
   moduleCount: z.number().int().min(1).max(64),
});

export function validateConfig(json: object) {
   return ConfigSchema.parse(json);
}

// extract the inferred type
export type Config = z.infer<typeof ConfigSchema>;