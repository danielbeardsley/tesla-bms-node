import { z } from "zod";
import config from '../config.json';

const ConfigSchema = z.object({
   battery: z.object({
      // Number of modules in the pack
      moduleCount: z.number().int().min(1).max(64),
      // Array of groups of module identifiers that are connected in series,
      // 0-indexed from the BMS connection point
      modulesInSeries: z.array(z.array(z.number())),
      serialPort: z.object({
         deviceName: z.string().min(1), // like "/dev/ttyUSB0"
      }),
      shunt: z.object({
         deviceName: z.string().min(1), // like "/dev/ttyUSB1"
      }),
      balance: z.object({
         cellVDiffMax: z.number().min(0.001).max(0.5),
         onlyAbove: z.number().min(0).max(5),
      }),
      charging: z.object({
         maxAmps: z.number(),
         maxVolts: z.number(),
         maxCellVolt: z.number(),
      }),
      discharging: z.object({
         maxAmps: z.number(),
         minVolts: z.number(),
         minCellVolt: z.number(),
      }),
      capacityPerModuleAh: z.number().min(0),
      // These are used to anchonr the 0% and 100% SoC voltages
      voltsEmpty: z.number(),
      voltsFull: z.number(),
      highTempCutoffC: z.number(),
      lowTempCutoffC: z.number(),
   }),
   bms: z.object({
      // How often to read the stats of the battery
      intervalS: z.number().int().min(1),
      // How old can the oldest battery data be before it's considered stale,
      // shutting down charging and discharging. Effectively, if you unplug
      // the battery comms cable, how long before we stop charging/discharging.
      batteryRecencyLimitS: z.number().int().min(1),
      chargingStrategy: z.object({
         name: z.literal("voltageA"),
         voltageA: z.optional(z.object({
            maxCellVoltBuffer: z.number().min(0.001).max(0.5),
         })),
      }),
   }),
   history: z.object({
      samplesToKeep: z.number().int().min(1),
      httpPort: z.number().int().min(0).max(65535).optional(),
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
