import express, { Application } from 'express';
import * as path from "path";
import { logger } from "../logger";
import { registerConfigRoutes } from "./config-routes";
import type { Server } from "http";

export interface AppServer {
   app: Application;
   server: Server;
}

export function startServer(port: number): AppServer {
   const app = createApp();
   const server = app.listen(port);
   logger.info(`HTTP server listening on port ${port}`);
   return { app, server };
}

export function createApp(): Application {
   const app = express();

   app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      next();
   });
   app.use(express.json());
   app.use('/ui', express.static(path.resolve(__dirname, '../../ui')));

   registerConfigRoutes(app);

   return app;
}
