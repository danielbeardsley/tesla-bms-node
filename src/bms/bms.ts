import { logger } from '../logger';
import { Battery } from '../battery/battery';
import { Config } from '../config';
import { Pylontech } from '../inverter/pylontech';
import { Command } from '../inverter/pylontech-command';
import type { Packet } from '../inverter/pylontech-packet';
// =========
import GetBatteryValues from '../inverter/commands/get-battery-values';
import GetAlarmInfo, { AlarmState } from '../inverter/commands/get-alarm-info';

const BATTERY_ADDRESS = 2;

class BMS {
    private battery: Battery;
    private timeout: NodeJS.Timeout;
    private config: Config;
    private inverter: Pylontech;

    constructor(battery: Battery, inverter: Pylontech, config: Config) {
        this.battery = battery;
        this.config = config;
        this.inverter = inverter;
    }

    async init() {
        await this.battery.init();
        await this.battery.readAll();
    }

    private async listenForInverterPacket() {
        try {
            const packet = await this.inverter.readPacket(5000);
            await this.handlePacket(packet);
        } finally {
            setTimeout(this.listenForInverterPacket.bind(this), 0);
        }
    }

    private async handlePacket(packet: Packet) {
        if (packet.address !== BATTERY_ADDRESS) {
            return;
        }
        logger.debug('Received packet', packet);
        let responsePacket: Buffer|null = null;
        const modules = Object.values(this.battery.modules);

        if (packet.command === Command.GetBatteryValues) {
            responsePacket = GetBatteryValues.Response.generate(packet.address, {
                infoFlag: 0,
                batteryNumber: 1,
                battery: {
                    cellVolts: modules.flatMap(module => module.cellVoltages),
                    temperaturesC: modules.flatMap(module => module.temperatures),
                    currentA: 0,
                    voltage: this.battery.getVoltage(),
                    cycleCount: 0,
                    totalCapacityAh: this.battery.getCapacityAh(),
                    remainingCapacityAh: this.battery.getRemainingAh(),
                }
            });

        } else if (packet.command === Command.GetAlarmInfo) {
            const cellVolts = modules.flatMap(module => module.cellVoltages);
            const temps = modules.flatMap(module => module.temperatures);
            responsePacket = GetAlarmInfo.Response.generate(packet.address, {
                cellVolts: cellVolts.map(() => AlarmState.Normal),
                temperatures: temps.map(() => AlarmState.Normal),
                chargeCurrent: AlarmState.Normal,
                batteryVolts: AlarmState.Normal,
                dischargeCurrent: AlarmState.Normal,
            });
        }

        if (responsePacket) {
            await this.inverter.writePacket(responsePacket);
        }
    }

    public start() {
        logger.info(`Starting Battery monitoring every $ds`, this.config.bms.intervalS);
        if (this.timeout) {
            throw new Error("BMS already running");
        }
        void this.monitorBattery();
        void this.listenForInverterPacket();
    }

    public stopMonitoringBattery() {
        clearInterval(this.timeout);
    }

    private async monitorBattery() {
        const now = Date.now();
        try {
            logger.debug("Starting work loop");
            await this.work();
        } catch (err) {
            logger.error(err)
        }
        logger.debug("Finished work loop in %d ms", Date.now() - now);
        this.timeout = setTimeout(this.monitorBattery.bind(this), this.config.bms.intervalS * 1000);
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