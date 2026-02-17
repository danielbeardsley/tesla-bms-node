import { logger, inverterLogger, batteryLogger } from '../logger';
import { BatteryI } from '../battery/battery';
import { Config } from '../config';
import { Inverter } from '../inverter/inverter';
import { Command, commandToMessage } from '../inverter/pylontech-command';
import type { Packet } from '../inverter/pylontech-packet';
import { History } from '../history/history';
import type { CanbusSerialPortI } from '../inverter/canbus';
import { packetStats as batteryPacketStats } from '../battery/tesla-comms';
import { sleep } from '../utils';
// =========
import GetChargeDischargeInfo, { ChargeInfo } from '../inverter/commands/get-charge-discharge-info';
import GetBatteryValues from '../inverter/commands/get-battery-values';
import GetAlarmInfo, { AlarmState } from '../inverter/commands/get-alarm-info';
import { ChargingModule } from './charging/charging-module';
import { VoltageA } from './charging/voltage-a';
import { Latterby } from './charging/latterby';
import { BatterySafety } from './battery-safety';
import { HistoryServer } from '../history/history-server';
import { Downtime } from '../history/downtime';
import { type StorageInterface } from '../storage';

const BATTERY_ADDRESS = 2;

class BMS {
    private battery: BatteryI;
    private batteryTimer: NodeJS.Timeout;
    private inverterTimer: NodeJS.Timeout;
    private config: Config;
    private inverter: Inverter;
    public readonly canbusInverter: CanbusSerialPortI;
    private history: History;
    private historyServer: HistoryServer;
    private batterySafety: BatterySafety;
    private chargingModules: {
        voltageA: ChargingModule;
        latterby: ChargingModule;
    }
    public readonly inverterRs485Downtime: Downtime;

    constructor(battery: BatteryI, inverter: Inverter, canbusInverter: CanbusSerialPortI, config: Config, storage: StorageInterface) {
        this.battery = battery;
        this.config = config;
        this.inverter = inverter;
        this.canbusInverter = canbusInverter;
        inverterLogger.info("Using config %j", config.inverter);
        batteryLogger.info("Using config %j", config.battery);
        logger.info("Using history config %j", config.history);
        this.history = new History(config.history.samplesToKeep);
        this.historyServer = new HistoryServer(this.history, battery, config, this, storage);
        this.chargingModules = {
            voltageA: new VoltageA(config, battery),
            latterby: new Latterby(config, battery, storage),
        };
        this.batterySafety = new BatterySafety(config, battery, 0.99);
        this.inverterRs485Downtime = new Downtime(
           config.inverter.serialPort.deviceName,
           'inverter',
           config.inverter.serialPort.downtimeS * 1_000
        );
    }

    async init() {
        await this.battery.stopBalancing();
        await this.battery.readAll();
        // Wait up to 10 seconds for shunt to be ready, otherwise, move on.
        await Promise.race([
           this.battery.shunt.ready,
           sleep(10_000)
        ]);
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

        this.inverterRs485Downtime.up();

        inverterLogger.verbose('Received packet (%s): %j', commandText, packet);
        let responsePacket: Buffer|null = null;
        const modules = Object.values(this.battery.modules);

        if (packet.command === Command.GetBatteryValues) {
            const chargingStrategyName = this.config.bms.chargingStrategy.name;
            const strategy = this.chargingModules[chargingStrategyName];
            const stateOfCharge = strategy.getStateOfCharge();

            responsePacket = GetBatteryValues.Response.generate(packet.address, {
                infoFlag: 0x11, // 0x11 = things have changed since last time
                batteryNumber: packet.address,
                battery: {
                    cellVolts: modules.flatMap(module => module.cellVoltages),
                    temperaturesC: modules.flatMap(module => module.temperatures),
                    currentA: 0,
                    voltage: this.battery.getVoltage(),
                    cycleCount: 0,
                    stateOfCharge,
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
            const chargeInfo = this.getChargeDischargeInfo();
            responsePacket = GetChargeDischargeInfo.Response.generate(packet.address, chargeInfo);
        }

        if (responsePacket) {
            await this.inverter.writePacket(responsePacket);
        }
    }

    public start() {
        batteryLogger.info(`Starting Battery monitoring every %ds`, this.config.bms.intervalS);
        if (this.batteryTimer) {
            throw new Error("BMS already running");
        }
        void this.monitorBattery();
        void this.listenForInverterPacket();
        if (this.config.history.httpPort) {
            void this.historyServer.start();
        }
        void this.canbusInverter.open().then(() => this.startCanbusTransmission());
    }

    private startCanbusTransmission() {
        if (!this.config.inverter.canbusSerialPort.deviceName) {
            inverterLogger.warn("Canbus serial port not configured, skipping canbus transmission");
            return;
        }
        const intervalMs = this.config.inverter.canbusSerialPort.transmitIntervalMs;
        logger.info("Starting canbus transmission");
        this.inverterTimer = setInterval(() => {
            const chargeData = this.getChargeDischargeInfo();
            this.canbusInverter.sendBatteryInfoToInverter(chargeData);
        }, intervalMs);
    }

    public stop() {
        clearTimeout(this.batteryTimer);
        clearInterval(this.inverterTimer);
    }

    public getTimeSinceInverterComms() {
        const rs485 = this.inverterRs485Downtime.getDowntime();
        const canbus = this.canbusInverter.downtime.getDowntime();
        return Math.min(rs485.timeSinceLastUpS, canbus.timeSinceLastUpS);
    }

    private getChargeDischargeInfo(): ChargeInfo {
        const batteryInfoRecent = Date.now() - this.battery.getLastUpdateDate() < this.config.bms.batteryRecencyLimitS * 1000;
        const safeTemp = this.battery.isTemperatureSafe();
        const tempRange = this.battery.getTemperatureRange();

        inverterLogger.silly("Battery temp range: %d - %d", tempRange.min, tempRange.max);
        if (!safeTemp) {
           inverterLogger.warn("Battery temperature out of range (%d - %d), battery disabled", this.config.battery.safety.lowTempCutoffC, this.config.battery.safety.highTempCutoffC);
        }

        const safeChargeInfo = this.batterySafety.getChargeDischargeInfo();

        const chargingStrategyName = this.config.bms.chargingStrategy.name;
        const strategy = this.chargingModules[chargingStrategyName];
        const chargeInfo = strategy.getChargeDischargeInfo();

        const chargingEnabled    = safeTemp && batteryInfoRecent && safeChargeInfo.chargingEnabled    && chargeInfo.chargingEnabled;
        const dischargingEnabled = safeTemp && batteryInfoRecent && safeChargeInfo.dischargingEnabled && chargeInfo.dischargingEnabled;

        const result = {
            chargeVoltLimit: this.config.battery.charging.maxVolts,
            dischargeVoltLimit: this.config.battery.discharging.minVolts,
            chargeCurrentLimit: Math.min(safeChargeInfo.chargeCurrentLimit, chargeInfo.chargeCurrentLimit),
            dischargeCurrentLimit: Math.min(safeChargeInfo.dischargeCurrentLimit, chargeInfo.dischargeCurrentLimit),
            chargingEnabled,
            dischargingEnabled,
            chargeFromGrid: Boolean(chargeInfo.chargeFromGrid) && chargingEnabled,
            _meta: {
                safeTemp,
                batteryInfoRecent,
                safeChargeInfo,
            }
        };

        this.history.updateSnapshotState({
           chargeSafety: safeChargeInfo,
           chargeModule: chargeInfo,
           chargeResult: result,
        });

        return result;
    }


    private async monitorBattery() {
        const now = Date.now();
        try {
            batteryLogger.debug("Starting work loop");
            await this.work();
        } catch (err) {
            logger.error(err)
        }
        batteryLogger.verbose("Finished work loop in %d ms", Date.now() - now);
        const refreshDelay = this.config.bms.intervalS * 1000
        this.batteryTimer = setTimeout(
            this.monitorBattery.bind(this),
            refreshDelay
        );
    }

    private async work() {
        const beforeUpdate = Date.now();
        try {
            await this.battery.stopBalancing();
            await this.battery.readAll();
            const range = this.battery.getCellVoltageRange();
            // Set this to slightly less than the measurement interval
            // so balancing ends a bit before the next measurement,
            // giving the cells a chance to settle so we get a truer voltage
            const secondsToBalance = this.config.bms.intervalS * 0.9;
            await this.battery.balance(secondsToBalance);
            batteryLogger.verbose(`Cell voltage spread:${(range.spread*1000).toFixed(0)}mV range: ${range.min.toFixed(3)}V - ${range.max.toFixed(3)}V`);
        } finally {
            this.recordHistory();
        }
        // Return true if all batteries were updated
        return this.battery.getLastUpdateDate() > beforeUpdate;
    }

    private recordHistory() {
        const bat = batteryPacketStats.getStatsAndReset();
        const batRatio = bat.total > 0 ? bat.bad / bat.total : 0;
        if (bat.bad) {
            batteryLogger.warn("Tesla Packets: total: %d, bad: %d%", bat.total, (batRatio * 100).toFixed(2));
        }

        const cellVoltageRange = this.battery.getCellVoltageRange();
        const tempRange = this.battery.getTemperatureRange();
        this.history.add(Date.now(), {
            batteryVolts: this.battery.getVoltage(),
            batteryAmps: this.battery.getCurrent() || 0,
            batteryWatts: (this.battery.getCurrent() || 0) * this.battery.getVoltage(),
            batteryCellVoltsMin: cellVoltageRange.min,
            batteryCellVoltsMax: cellVoltageRange.max,
            batteryTempMin: tempRange.min,
            batteryTempMax: tempRange.max,
            tesla: bat,
            rs485: this.inverter.packetStats.getStatsAndReset(),
            shunt: this.battery.shunt.packetStats.getStatsAndReset(),
            canbus: this.canbusInverter.packetStats.getStatsAndReset(),
        });
    }
}

export { 
    BMS
};
