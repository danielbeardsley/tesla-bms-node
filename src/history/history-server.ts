import { Config } from "src/config";
import { History } from "./history";
import express, { Request, Response, Application } from 'express';
import { BatteryI } from "../battery/battery";

export class HistoryServer {
   private history: History;
   private battery: BatteryI;
   private config: Config['history'];
   private app: Application;
   private server: ReturnType<Application['listen']>|null = null;

   constructor(history: History, battery: BatteryI, config: Config['history']) {
      this.history = history;
      this.battery = battery;
      this.config = config;
      this.app = express();
      this.init();
   }

   private init() {
      this.app.get('/history', (req: Request, res: Response) => {
         const limit = parseInt(String(req.query.limit));
         const values = this.history.getValues(limit || undefined);
         res.json(values);
      });
      this.app.get('/current', (_req: Request, res: Response) => {
         const response = {
            cellVoltageRange: this.battery.getCellVoltageRange(),
            tempRange: this.battery.getTemperatureRange(),
            stateOfCharge: this.battery.getStateOfCharge(),
            voltage: this.battery.getVoltage(),
            modules: Object.values(this.battery.modules).map(module => ({
               cellVoltages: module.cellVoltages,
               temperatures: module.temperatures,
            })),
         };
         res.json(response);
      });
   }

   start() {
      this.server = this.app.listen(this.config.httpPort);
   }

   stop() {
      this.server?.close();
   }
}