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
         downtimeS: z.number().int().min(1),
      }),
      balance: z.object({
         cellVDiffMax: z.number().min(0.001).max(0.5),
         onlyAbove: z.number().min(0).max(5),
      }),
      charging: z.object({
         maxAmps: z.number(),
         maxVolts: z.number(),
      }),
      discharging: z.object({
         maxAmps: z.number(),
         minVolts: z.number(),
      }),
      safety: z.object({
         minCellVolt: z.number(),
         maxCellVolt: z.number(),
         // % SOC change (up or down) which will re-enable charging /
         // discharging after hitting a cell volt limit.
         cellVoltLimitSocRecovery: z.number().min(0).max(20),
         highTempCutoffC: z.number(),
         lowTempCutoffC: z.number(),
         maxCellVoltBuffer: z.number().min(0.001).max(0.5),
      }),
      capacityPerModuleAh: z.number().min(0),
      // These are used to anchonr the 0% and 100% SoC voltages
      voltsEmpty: z.number(),
      voltsFull: z.number(),
   }),
   bms: z.object({
      // How often to read the stats of the battery
      intervalS: z.number().int().min(1),
      // How old can the oldest battery data be before it's considered stale,
      // shutting down charging and discharging. Effectively, if you unplug
      // the battery comms cable, how long before we stop charging/discharging.
      batteryRecencyLimitS: z.number().int().min(1),
      chargingStrategy: z.object({
         name: z.enum(['voltageA', 'latterby']),
         voltageA: z.optional(z.object({
         })),
         latterby: z.optional(z.object({
            // Normally charge up to this %
            stopChargeAtPct: z.number().min(0).max(100),
            // Resume charging when battery drops to this %
            resumeChargeAtPct: z.number().min(0).max(100),

            // Normally stop discharging when battery reaches this %
            stopDischargeAtPct: z.number().min(0).max(100),
            // Resume discharging when battery rises to this %
            resumeDischargeAtPct: z.number().min(0).max(100),
            // How long after reaching full charge do we allow charging again.
            // Tune this to prevent rapid cycling
            rechargeDelaySec: z.number().int().min(0),
            // How often to charge the battery to 100% to sync the state of 
            // of the shunt with reality
            daysBetweenSynchronizations: z.number().int().min(1),
            synchronizationVoltage: z.number().min(0),
            // If solar doesn't give us a full charge after this many days,
            // chagre to 100% from the grid.
            chargeFromGridDelayDays: z.number().int().min(0).optional(),
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
         downtimeS: z.number().int().min(1),
      }),
      canbusSerialPort: z.object({
         deviceName: z.string(),
         baudRate: z.number().int().min(1),
         transmitIntervalMs: z.number().int().min(100).max(10000),
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
