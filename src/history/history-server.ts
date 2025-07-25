import { Config } from "src/config";
import { History } from "./history";
import express, { Request, Response, Application } from 'express';
import { BatteryI } from "../battery/battery";
import { BMS } from "../bms/bms";

export class HistoryServer {
   private history: History;
   private battery: BatteryI;
   private config: Config;
   private app: Application;
   private bms: BMS;
   private server: ReturnType<Application['listen']>|null = null;

    constructor(history: History, battery: BatteryI, config: Config, bms: BMS) {
      this.history = history;
      this.battery = battery;
      this.config = config;
      this.app = express();
      this.bms = bms;
      this.init();
   }

   private init() {
      // Allow accessing the data from any other origin
      // Origins are still limited by who can access the local server
      this.app.use((_req, res, next) => {
         res.header('Access-Control-Allow-Origin', '*');
         next();
      });
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
            modulesInSeries: this.config.battery.modulesInSeries,
            timeSinceInverterComms: Math.round(this.bms.getTimeSinceInverterComms()),
            downtime: {
                rs485: this.bms.inverterRs485Downtime.getDowntime(),
                canbus: this.bms.canbusInverter.downtime.getDowntime(),
                battery: this.battery.downtime.getDowntime(),
                shunt: this.battery.shunt.downtime.getDowntime(),
            },
         };
         res.json(response);
      });
   }

   start() {
      this.server = this.app.listen(this.config.history.httpPort);
   }

   stop() {
      this.server?.close();
   }
}