import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.colorize(),
    format.splat(),
    format.simple(),
  ),
  transports: [
    new transports.Console(),
  ]
});