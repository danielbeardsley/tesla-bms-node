import { z } from "zod";
import config from '../config.json';

const ConfigSchema = z.object({
   battery: z.object({
      // Number of modules in the pack
      moduleCount: z.number().int().min(1).max(64),
      serialPort: z.object({
         deviceName: z.string().min(1), // like "/dev/ttyUSB0"
      }),
      balance: z.object({
         cellVDiffMax: z.number().min(0.001).max(0.5),
         onlyAbove: z.number().min(0).max(5),
      }),
   }),
   bms: z.object({
      // How often to check the battery and inform the inverter
      intervalMs: z.number().int().min(1000),
   }),
});

export function validateConfig(json: object) {
   return ConfigSchema.parse(json);
}

// extract the inferred type
export type Config = z.infer<typeof ConfigSchema>;

export function getConfig(): Config {
   return validateConfig(config);
}
