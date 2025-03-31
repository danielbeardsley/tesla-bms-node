import { logger, inverterLogger, batteryLogger } from '../logger';
import { BatteryI } from '../battery/battery';
import { Config } from '../config';
import { Inverter } from '../inverter/inverter';
import { Command, commandToMessage } from '../inverter/pylontech-command';
import type { Packet } from '../inverter/pylontech-packet';
import { History } from '../history/history';
// =========
import GetChargeDischargeInfo from '../inverter/commands/get-charge-discharge-info';
import GetBatteryValues from '../inverter/commands/get-battery-values';
import GetAlarmInfo, { AlarmState } from '../inverter/commands/get-alarm-info';
import { ChargingModule } from './charging/charging-module';
import { VoltageA } from './charging/voltage-a';
import { HistoryServer } from '../history/history-server';

const BATTERY_ADDRESS = 2;

class BMS {
    private battery: BatteryI;
    private timeout: NodeJS.Timeout;
    private config: Config;
    private inverter: Inverter;
    private history: History;
    private historyServer: HistoryServer;
    private chargingModules: {
        voltageA: ChargingModule;
    }

    constructor(battery: BatteryI, inverter: Inverter, config: Config) {
        this.battery = battery;
        this.config = config;
        this.inverter = inverter;
        inverterLogger.info("Using config %j", config.inverter);
        batteryLogger.info("Using config %j", config.battery);
        this.history = new History(config.history.samplesToKeep);
        this.historyServer = new HistoryServer(this.history, config.history);
        this.chargingModules = {
            "voltageA": new VoltageA(config, battery),
        };
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
        const batteryInfoRecent = Date.now() - this.battery.getLastUpdateDate() < this.config.bms.batteryRecencyLimitS * 1000;

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
            const tempRange = this.battery.getTemperatureRange();
            const safeTemp = this.battery.isTemperatureSafe();

            inverterLogger.silly("Battery temp range: %d - %d", tempRange.min, tempRange.max);
            if (!safeTemp) {
                inverterLogger.warn("Battery temperature out of range (%d - %d), battery disabled", this.config.battery.lowTempCutoffC, this.config.battery.highTempCutoffC);
            }

            const chargingStrategyName = this.config.bms.chargingStrategy.name;
            const strategy = this.chargingModules[chargingStrategyName];
            const chargeInfo = strategy.getChargeDischargeInfo();

            responsePacket = GetChargeDischargeInfo.Response.generate(packet.address, {
                chargeVoltLimit: chargeInfo.chargeVoltLimit,
                dischargeVoltLimit: chargeInfo.dischargeVoltLimit,
                chargeCurrentLimit: chargeInfo.chargeCurrentLimit,
                dischargeCurrentLimit: chargeInfo.dischargeCurrentLimit,
                chargingEnabled: safeTemp && batteryInfoRecent && chargeInfo.chargingEnabled,
                dischargingEnabled: safeTemp && batteryInfoRecent && chargeInfo.dischargingEnabled,
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
        if (this.config.history.httpPort) {
            void this.historyServer.start();
        }
    }

    public stop() {
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
        this.recordHistory();
    }

    private recordHistory() {
        const cellVoltageRange = this.battery.getCellVoltageRange();
        const tempRange = this.battery.getTemperatureRange();
        this.history.add(Date.now(), {
            batteryVolts: this.battery.getVoltage(),
            batteryCellVoltsMin: cellVoltageRange.min,
            batteryCellVoltsMax: cellVoltageRange.max,
            batteryTempMin: tempRange.min,
            batteryTempMax: tempRange.max,
        });
    }
}

export { 
    BMS
};