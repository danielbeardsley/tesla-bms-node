import { Config } from './config';

export function getTestConfig(): Config {
    return {
        battery: {
            moduleCount: 2,
            serialPort: {
                deviceName: '/dev/ttyUSB0',
            },
            balance: {
                cellVDiffMax: 0.1,
                onlyAbove: 3.5,
            },
            charging: {
                maxAmps: 100,
                maxVolts: 54.6,
                maxCellVolt: 4.2,
            },
            discharging: {
                maxAmps: 100,
                minVolts: 40,
                minCellVolt: 3.0,
            },
            voltsEmpty: 40,
            voltsFull: 50,
            capacityPerModuleAh: 100,
            highTempCutoffC: 60,
            lowTempCutoffC: 0,
        },
        bms: {
            intervalS: 5,
            batteryRecencyLimitS: 5,
            chargingStrategy: {
                name: 'voltageA',
                voltageA: {
                    maxCellVoltBuffer: 0.1,
                }
            },
        },
        history: {
            samplesToKeep: 10,
        },
        inverter: {
            serialPort: {
                deviceName: '/dev/ttyUSB1',
                baudRate: 115200,
            },
        },
    };
}

