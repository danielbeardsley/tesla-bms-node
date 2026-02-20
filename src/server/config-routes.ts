import { getConfig, updateConfig } from "../config";
import { Request, Response, Application } from 'express';
import { ZodError } from "zod";
import { diffConfigs, getChangelog, logConfigChanges } from "./config-changelog";

export function registerConfigRoutes(app: Application) {
   app.get('/config', (_req: Request, res: Response) => {
      res.json(getConfig());
   });

   app.patch('/config', (req: Request, res: Response) => {
      try {
         const before = JSON.parse(JSON.stringify(getConfig()));
         const updated = updateConfig(req.body);
         const changes = diffConfigs(before, updated as Record<string, unknown>);
         if (changes.length > 0) {
            logConfigChanges(changes);
         }
         res.json(updated);
      } catch (err) {
         if (err instanceof ZodError) {
            res.status(400).json({ error: err.errors });
         } else {
            res.status(500).json({ error: String(err) });
         }
      }
   });

   app.get('/config/changelog', (_req: Request, res: Response) => {
      res.json(getChangelog());
   });
}
