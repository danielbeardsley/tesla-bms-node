import { logger, inverterLogger, batteryLogger } from '../logger';
import { Battery } from '../battery/battery';
import { Config } from '../config';
import { Pylontech } from '../inverter/pylontech';
import { Command } from '../inverter/pylontech-command';
import type { Packet } from '../inverter/pylontech-packet';
// =========
import GetChargeDischargeInfo from '../inverter/commands/get-charge-discharge-info';
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
        inverterLogger.info("Using config %j", config.inverter);
        batteryLogger.info("Using config %j", config.battery);
    }

    async init() {
        // TODO: Remove these calls from index.ts
        await this.battery.init();
        await this.battery.readAll();
    }

    private async listenForInverterPacket() {
        try {
            const packet = await this.inverter.readPacket();
            await this.handlePacket(packet);
        } catch (e) {
            logger.error("Failed when reading inverter packet", e)
        } finally {
            setTimeout(this.listenForInverterPacket.bind(this), 0);
        }
    }

    private async handlePacket(packet: Packet) {
        if (packet.address !== BATTERY_ADDRESS) {
            inverterLogger.silly('Received packet not for us at address: %d', packet.address);
            return;
        }
        inverterLogger.verbose('Received packet %j', packet);
        let responsePacket: Buffer|null = null;
        const modules = Object.values(this.battery.modules);

        if (packet.command === Command.GetBatteryValues) {
            responsePacket = GetBatteryValues.Response.generate(packet.address, {
                infoFlag: 0,
                batteryNumber: packet.address,
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
        } else if (packet.command === Command.GetChargeDischargeInfo) {
            const cellVoltageRange = this.battery.getCellVoltageRange();
            responsePacket = GetChargeDischargeInfo.Response.generate(packet.address, {
                chargeVoltLimit: this.config.battery.charging.maxVolts,
                dischargeVoltLimit: this.config.battery.discharging.minVolts,
                chargeCurrentLimit: this.config.battery.charging.maxAmps,
                dischargeCurrentLimit: this.config.battery.discharging.maxAmps,
                chargingEnabled: cellVoltageRange.max < this.config.battery.charging.maxCellVolt,
                dischargingEnabled: cellVoltageRange.min > this.config.battery.discharging.minCellVolt,
            });
        }

        if (responsePacket) {
            await this.inverter.writePacket(responsePacket);
        }
    }

    public start() {
        batteryLogger.info(`Starting Battery monitoring every $ds`, this.config.bms.intervalS);
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
            batteryLogger.debug("Starting work loop");
            await this.work();
        } catch (err) {
            logger.error(err)
        }
        batteryLogger.debug("Finished work loop in %d ms", Date.now() - now);
        this.timeout = setTimeout(this.monitorBattery.bind(this), this.config.bms.intervalS * 1000);
    }

    private async work() {
        await this.battery.stopBalancing();
        await this.battery.readAll();
        const range = await this.battery.getCellVoltageRange();
        await this.battery.balance(this.config.bms.intervalS);
        batteryLogger.debug(`Cell voltage spread:${(range.spread*1000).toFixed(0)}mV range: ${range.min.toFixed(3)}V - ${range.max.toFixed(3)}V`);
    }
}

export { 
    BMS
};