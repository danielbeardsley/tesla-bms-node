import { describe, it, expect, vi } from 'vitest';
import { Packet } from '../inverter/pylontech-packet';
import { BMS } from './bms';
import { FakeBattery } from './fake-battery';
import { Config } from '../config';
import { Inverter } from '../inverter/inverter';
import { orThrow } from '../utils';

describe('BMS', () => {
    it('Should read from the battery immediately', async () => {
        const battery = new FakeBattery();
        const initSpy = vi.spyOn(battery, 'init');
        const readAllSpy = vi.spyOn(battery, 'readAll');
        const bms = new BMS(battery, getInverter(), getConfig());
        await bms.init();
        expect(initSpy).toHaveBeenCalled();
        expect(readAllSpy).toHaveBeenCalled();
    });
});

function getInverter(): Inverter {
    const packets = [] as Packet[];
    return {
        packets,
        readPacket: async (_timeout?: number): Promise<Packet> => {
            return orThrow(packets.pop());
        },
        writePacket: async (packet) => {
            console.log('Writing packet:', packet);
        },
    } as Inverter;
}

function getConfig(): Config {
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
        },
        inverter: {
            serialPort: {
                deviceName: '/dev/ttyUSB1',
                baudRate: 115200,
            },
        },
    };
}
