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

    public start() {
        logger.info(`Starting Battery monitoring every $ds`, this.config.bms.intervalS);
        if (this.timeout) {
            throw new Error("BMS already running");
        }
        void this.workLoop();
    }

    public stopMonitoring() {
        clearInterval(this.timeout);
    }

    private async workLoop() {
        const now = Date.now();
        try {
            logger.debug("Starting work loop");
            await this.work();
        } catch (err) {
            logger.error(err)
        }
        logger.debug("Finished work loop in %d ms", Date.now() - now);
        this.timeout = setTimeout(this.workLoop, this.config.bms.intervalS);
    }

    private async work() {
        await this.battery.stopBalancing();
        await this.battery.readAll();
        const range = await this.battery.getCellVoltageRange();
        await this.battery.balance(this.config.bms.intervalS);
        logger.debug(`Cell voltage spread:${(range.spread*1000).toFixed(0)}mV range: ${range.min.toFixed(3)}V - ${range.max.toFixed(3)}V`);
        const chargeParams = this.getChargeParameters();
    }

    private getChargeParameters() {
        const cellVoltageRange = this.battery.getCellVoltageRange();
        return {
            chargeCurrent: this.config.battery.charging.amps,
            chargeVolts: this.config.battery.charging.volts,
            maxDischargeAmps: this.config.battery.discharging.maxAmps,
            canCharge: cellVoltageRange.max >= this.config.battery.charging.maxCellVolt,
            canDischarge: cellVoltageRange.min <= this.config.battery.discharging.minCellVolt,
        };
    }
}

export { 
    BMS
};