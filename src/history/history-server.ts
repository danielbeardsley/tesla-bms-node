import { Config } from "../config";
import { History } from "./history";
import { Request, Response, Application } from 'express';
import { BatteryI } from "../battery/battery";
import { BMS } from "../bms/bms";
import { StorageInterface } from "../storage";

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
