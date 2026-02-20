import { getConfig, updateConfig } from "../config";
import { Request, Response, Application } from 'express';
import { ZodError } from "zod";

export function registerConfigRoutes(app: Application) {
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
}
