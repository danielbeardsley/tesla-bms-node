import { logger } from '../logger';
import { Battery } from '../battery/battery';
import { Config } from '../config';

class BMS {
    private battery: Battery;
    private timeout: NodeJS.Timeout;
    private config: Config;

    constructor(battery: Battery, config: Config) {
        this.battery = battery;
        this.config = config;
    }

    async init() {
        await this.battery.init();
        await this.battery.readAll();
    }

    public startMonitoring() {
        this.timeout = setInterval(() => {
            this.workLoop();
        }, this.config.bms.intervalMs);
    }

    public stopMonitoring() {
        clearInterval(this.timeout);
    }

    private workLoop() {
        this.battery.readAll();
        const range = this.battery.getCellVoltageRange();
        logger.debug(`Cell voltage spread:${(range.spread*1000).toFixed(0)}mV range: ${range.min.toFixed(3)}V - ${range.max.toFixed(3)}V`);
    }
}

export { 
    BMS
};