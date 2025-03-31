import { Config } from "src/config";
import { History } from "./history";
import express, { Request, Response, Application } from 'express';

export class HistoryServer {
   private history: History;
   private config: Config['history'];
   private app: Application;
   private server: ReturnType<Application['listen']>|null = null;

   constructor(history: History, config: Config['history']) {
      this.history = history;
      this.config = config;
      this.app = express();
      this.init();
   }

   private init() {
      this.app.get('/history', (_req: Request, res: Response) => {
         console.log("History request: ", this.history);
         const values = this.history.getValues();
         res.json(values);
      });
   }

   start() {
      this.server = this.app.listen(this.config.httpPort);
   }

   stop() {
      this.server?.close();
   }
}