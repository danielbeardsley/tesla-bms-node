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
      charging: z.object({
         amps: z.number(),
         volts: z.number(),
         maxCellVolt: z.number(),
      }),
      discharging: z.object({
         maxAmps: z.number(),
         minCellVolt: z.number(),
      })
   }),
   bms: z.object({
      // How often to check the battery and inform the inverter
      intervalS: z.number().int().min(1),
   }),
   inverter: z.object({
      serialPort: z.object({
         deviceName: z.string().min(1),
         baudRate: z.number().int().min(1),
      }),
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
