import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: 'info',
  silent: process.env.NODE_ENV === 'test',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.colorize(),
    format.splat(),
    format.simple(),
    format.printf(
        info =>
          // https://stackoverflow.com/a/69044670/20358783 more detailLocaleString
          `${info.timestamp} ${info.level}: ${info.label || 'main'}: ${info.message}`
      ),
  ),
  transports: [
    new transports.Console({level: process.env.LOG_LEVEL || 'info'}),
  ]
});

export const inverterLogger = logger.child({label: 'inverter'});
export const batteryLogger = logger.child({label: 'battery'});