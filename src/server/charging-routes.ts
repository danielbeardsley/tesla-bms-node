import { Request, Response, Application } from 'express';
import { getConfig } from '../config';
import { StorageInterface } from '../storage';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function registerChargingRoutes(app: Application, storage: StorageInterface) {
   app.post('/charging/high-capacity-mode', (req: Request, res: Response) => {
      const conf = getConfig().bms.chargingStrategy.latterby;
      if (!conf?.highCapacity) {
         res.status(400).json({ error: 'No highCapacity config block is set' });
         return;
      }
      const days = Number((req.body as { days?: unknown })?.days);
      if (!Number.isFinite(days) || days <= 0) {
         res.status(400).json({ error: 'Body must be { days: <positive number> }' });
         return;
      }
      const validUntil = Date.now() + days * MS_PER_DAY;
      void storage.update({ highCapacityModeValidUntil: validUntil })
         .then(() => res.json({ highCapacityModeValidUntil: validUntil }))
         .catch((err: unknown) => res.status(500).json({ error: String(err) }));
   });

   app.delete('/charging/high-capacity-mode', (_req: Request, res: Response) => {
      void storage.update({ highCapacityModeValidUntil: undefined })
         .then(() => res.json({ highCapacityModeValidUntil: undefined }))
         .catch((err: unknown) => res.status(500).json({ error: String(err) }));
   });
}
