import { Config, getConfig, updateConfig } from "../config";
import { History } from "./history";
import express, { Request, Response, Application } from 'express';
import * as path from "path";
import { BatteryI } from "../battery/battery";
import { BMS } from "../bms/bms";
import { StorageInterface } from "../storage";
import { ZodError } from "zod";
import { logger } from "../logger";

/**
 * Start an Express server with config and UI routes immediately.
 * BMS-dependent routes (/history, /current) are added later via HistoryServer.
 */
export function startConfigServer(port: number): Application {
   const app = express();

   app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      next();
   });
   app.use(express.json());
   app.use('/ui', express.static(path.resolve(__dirname, '../../ui')));

   app.get('/config', (_req: Request, res: Response) => {
      res.json(getConfig());
   });

   app.patch('/config', (req: Request, res: Response) => {
      try {
         const updated = updateConfig(req.body);
         res.json(updated);
      } catch (err) {
         if (err instanceof ZodError) {
            res.status(400).json({ error: err.errors });
         } else {
            res.status(500).json({ error: String(err) });
         }
      }
   });

   app.listen(port);
   logger.info(`HTTP server listening on port ${port}`);
   return app;
}

export class HistoryServer {
   private history: History;
   private battery: BatteryI;
   private config: Config;
   private bms: BMS;
   private storage: StorageInterface;

   constructor(app: Application, history: History, battery: BatteryI, config: Config, bms: BMS, storage: StorageInterface) {
      this.history = history;
      this.battery = battery;
      this.config = config;
      this.bms = bms;
      this.storage = storage;
      this.init(app);
   }

   private init(app: Application) {
      app.get('/history', (req: Request, res: Response) => {
         const limit = parseInt(String(req.query.limit));
         const values = this.history.getValues(limit || undefined);
         res.json(values);
      });
      app.get('/current', (req: Request, res: Response) => {
         const historyLimit = parseInt(String(req.query.history)) || 30;
         const response = {
            cellVoltageRange: this.battery.getCellVoltageRange(),
            tempRange: this.battery.getTemperatureRange(),
            stateOfCharge: this.battery.getStateOfCharge(),
            voltage: this.battery.getVoltage(),
            amps: this.battery.getCurrent(),
            watts: (this.battery.getCurrent() || 0) * this.battery.getVoltage(),
            modules: Object.values(this.battery.modules).map(module => ({
               id: module.getId(),
               cellVoltages: module.cellVoltages,
               temperatures: module.temperatures,
               balancing: module.balancing,
            })),
            modulesInSeries: this.config.battery.modulesInSeries,
            timeSinceInverterComms: Math.round(this.bms.getTimeSinceInverterComms()),
            downtime: {
                rs485: this.bms.inverterRs485Downtime.getDowntime(),
                // don't include canbus while we're not using it
                // canbus: this.bms.canbusInverter.downtime.getDowntime(),
                battery: this.battery.downtime.getDowntime(),
                shunt: this.battery.shunt.downtime.getDowntime(),
            },
            history: this.history.getValues(historyLimit),
            shunt: this.battery.shunt.getAllData(),
            storage: this.storage.get(),
            ...this.history.snapshotState,
         };
         res.json(response);
      });
   }
}
