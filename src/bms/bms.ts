import { logger, inverterLogger, batteryLogger } from '../logger';
import { Battery } from '../battery/battery';
import { Config } from '../config';
import { Pylontech } from '../inverter/pylontech';
import { Command, commandToMessage } from '../inverter/pylontech-command';
import type { Packet } from '../inverter/pylontech-packet';
import { clamp } from '../utils';
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
        await this.battery.init();
        await this.battery.readAll();
    }

    private async listenForInverterPacket() {
        try {
            const packet = await this.inverter.readPacket();
            try {
                await this.handlePacket(packet);
            } catch (e) {
                // TODO actually log this 'e', logger.error doesn't
                logger.error("Failed when creating inverter response packet", e)
            }
        } catch (e) {
            // TODO actually log this 'e', logger.error doesn't
            logger.error("Failed when reading inverter packet", e)
        } finally {
            setTimeout(this.listenForInverterPacket.bind(this), 0);
        }
    }

    private async handlePacket(packet: Packet) {
        const commandText = commandToMessage(packet.command);
        if (packet.address !== BATTERY_ADDRESS) {
            inverterLogger.silly('Packet not for us (%s): %j', commandText, packet);
            return;
        }
        inverterLogger.verbose('Received packet (%s): %j', commandText, packet);
        let responsePacket: Buffer|null = null;
        const modules = Object.values(this.battery.modules);

        if (packet.command === Command.GetBatteryValues) {
            responsePacket = GetBatteryValues.Response.generate(packet.address, {
                infoFlag: 0x11, // 0x11 = things have changed since last time
                batteryNumber: packet.address,
                battery: {
                    cellVolts: modules.flatMap(module => module.cellVoltages),
                    temperaturesC: modules.flatMap(module => module.temperatures),
                    currentA: 0,
                    voltage: this.battery.getVoltage(),
                    cycleCount: 0,
                    stateOfCharge: this.battery.getStateOfCharge(),
                    totalCapacityAh: this.battery.getCapacityAh(),
                }
            });

        } else if (packet.command === Command.GetAlarmInfo) {
            const cellVolts = modules.flatMap(module => module.cellVoltages);
            const temps = modules.flatMap(module => module.temperatures);
            responsePacket = GetAlarmInfo.Response.generate(packet.address, {
                infoFlag: 0x11, // 0x11 = things have changed since last time
                cellVolts: cellVolts.map(() => AlarmState.Normal),
                temperatures: temps.map(() => AlarmState.Normal),
                chargeCurrent: AlarmState.Normal,
                batteryVolts: AlarmState.Normal,
                dischargeCurrent: AlarmState.Normal,
            });

        } else if (packet.command === Command.GetChargeDischargeInfo) {
            const cellVoltageRange = this.battery.getCellVoltageRange();
            inverterLogger.debug("Voltage range: %d - %d", cellVoltageRange.min, cellVoltageRange.max);
            // Scale down the charging current as the highest volt cell
            // gets within "buffer" volts of the maxCellVolt setting
            const maxCellVolt = this.config.battery.charging.maxCellVolt;
            const buffer = 0.2;
            const bufferStart = maxCellVolt - buffer;
            const chargeScale = 1 - clamp((cellVoltageRange.max - bufferStart) / buffer, 0, 1);

            responsePacket = GetChargeDischargeInfo.Response.generate(packet.address, {
                chargeVoltLimit: this.config.battery.charging.maxVolts,
                dischargeVoltLimit: this.config.battery.discharging.minVolts,
                chargeCurrentLimit: this.config.battery.charging.maxAmps * chargeScale,
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
        batteryLogger.info(`Starting Battery monitoring every %ds`, this.config.bms.intervalS);
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
        const range = this.battery.getCellVoltageRange();
        await this.battery.balance(this.config.bms.intervalS);
        batteryLogger.debug(`Cell voltage spread:${(range.spread*1000).toFixed(0)}mV range: ${range.min.toFixed(3)}V - ${range.max.toFixed(3)}V`);
    }
}

export { 
    BMS
};