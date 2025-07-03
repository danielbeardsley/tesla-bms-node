import { describe, it, expect, vi } from 'vitest';
import { Packet } from '../inverter/pylontech-packet';
import { BMS } from './bms';
import { BatteryI } from '../battery/battery';
import { FakeBattery } from './fake-battery';
import { getTestConfig } from '../test-config';
import { orThrow, sleep } from '../utils';
import { Command } from 'src/inverter/pylontech-command';
import type { ChargeInfo } from '../inverter/commands/get-charge-discharge-info';
import { HistoryColumns } from '../history/history';

describe('BMS', () => {
    it('Should read from the battery immediately', async () => {
        const battery = new FakeBattery();
        const readAllSpy = vi.spyOn(battery, 'readAll');
        const inverter = getInverter();
        const bms = new BMS(battery, inverter, getCanbusInverter(battery), getTestConfig());
        await bms.init();
        expect(readAllSpy).toHaveBeenCalled();
    });

    it('Should read from the battery in a loop', async () => {
        const battery = new FakeBattery();
        const readAll = vi.spyOn(battery, 'readAll');
        const balance = vi.spyOn(battery, 'balance');
        const stopBalancing = vi.spyOn(battery, 'stopBalancing');
        const config = getTestConfig();
        const inverter = getInverter();
        config.bms.intervalS = 0;

        const bms = new BMS(battery, inverter, getCanbusInverter(battery), config);
        await bms.init();
        readAll.mockClear();
        bms.start();
        await sleep(0);
        await sleep(0);
        expect(readAll).toHaveBeenCalledTimes(2);
        expect(stopBalancing).toHaveBeenCalledTimes(2);
        expect(balance).toHaveBeenCalledTimes(2);
        bms.stop();
    });

    it('Should respond to inverter GetBatteryValues requests', async () => {
        const inverterRequest = getRequestPacket(Command.GetBatteryValues, 2);
        const responses = await getBmsResponse(inverterRequest);
        expect(responses[0][0].toString()).toMatchInlineSnapshot(`"20024600806211020C0E740E740E740E740E740E740E740E740E740E740E740E74050B7D0B7D0B7D0B7D0B7D00000000000002EA600000"`);
    });
    
    it('Should respond to inverter GetAlarmInfo requests', async () => {
        const inverterRequest = getRequestPacket(Command.GetAlarmInfo, 2);
        const responses = await getBmsResponse(inverterRequest);
        expect(responses[0][0].toString()).toMatchInlineSnapshot(`"20024600303A11010C0000000000000000000000000500000000000000000000000000"`);
    });

    it('Should respond to inverter GetChargeDischargeInfo requests', async () => {
        const inverterRequest = getRequestPacket(Command.GetChargeDischargeInfo, 2);
        const responses = await getBmsResponse(inverterRequest);
        expect(responses[0][0].toString()).toMatchInlineSnapshot(`"20024600B01402D5489C400000000000"`);
    });

    it('Should not respond to requests to a different battery', async () => {
        const inverterRequest = getRequestPacket(Command.GetBatteryValues, 3);
        const responses = await getBmsResponse(inverterRequest);
        expect(responses).toEqual([]);
    });
});

describe('BMS History', () => {
    it('Should serve history recordings', async () => {
        const config = getTestConfig();
        const port = config.history.httpPort = 8089;
        const inverter = getInverter();
        const battery = new FakeBattery();
        battery.temperatureRange = {min: 18, max: 21, spread: 3};
        battery.voltageRange = {min: 3.6, max: 3.7, spread: 0.1};
        battery.voltage = 48;
        const bms = new BMS(battery, inverter, getCanbusInverter(battery), config);
        await bms.init();
        bms.start();
        // Let the BMs read the battery and store the history
        await sleep(0);
        const result = await fetch(`http://127.0.0.1:${port}/history`);
        const json = await result.json() as HistoryColumns & { timestamps?: number[] };
        delete json.timestamps;
        expect(json).toEqual({
            batteryVolts: [48],
            batteryCellVoltsMin: [3.6],
            batteryCellVoltsMax: [3.7],
            batteryTempMin: [18],
            batteryTempMax: [21],
        });
        // Let the BMs read the battery and store the history
        const resultCurrent = await fetch(`http://127.0.0.1:${port}/current`);
        const current = await resultCurrent.json();
        expect(current).toEqual({
            cellVoltageRange: {
                min: 3.6,
                max: 3.7,
                spread: 0.1,
            },
            tempRange: {
                min: 18,
                max: 21,
                spread: 3,
            },
            voltage: 48,
            modules: [
                {
                    cellVoltages: [3.7, 3.7, 3.7, 3.7, 3.7, 3.7],
                    temperatures: [21, 21, 21, 21, 21, 21, 21],
                },
                {
                    cellVoltages: [3.7, 3.7, 3.7, 3.7, 3.7, 3.7],
                    temperatures: [21, 21, 21, 21, 21, 21, 21],
                }
            ],
            stateOfCharge: 0,
            modulesInSeries: [[0,1]],
        });
        bms.stop();
    });
});

function getInverter() {
    const packets = [] as Array<Packet | Promise<Packet>>;
    const packetSenders = [] as Array<(packet: Packet) => void>;
    function stagePacket() {
        const packetPromise = new Promise((resolve) => packetSenders.push(resolve));
        packets.push(packetPromise as Promise<Packet>);
    }
    stagePacket();
    return {
        mockPacketFromInverter: async (packet: Packet) => {
            orThrow(packetSenders.pop())(packet);
            stagePacket();
        },
        readPacket: async (_timeout?: number): Promise<Packet> => {
            return orThrow(packets.pop());
        },
        writePacket: async (_packet: Buffer) => {
        },
    };
}

// ===============
function getCanbusInverter(_battery: BatteryI) {
   return {
     async open(): Promise<void> { },
     close(): void { },
     sendBatteryInfoToInverter(_chargeData: ChargeInfo) { }
   }
}

function getRequestPacket(command: Command, address: number) {
    return {
        version: 0x20,
        address,
        command,
        data: Buffer.alloc(0),
        datalength: 0,
        lengthChecksum: 0,
    }
}

async function getBmsResponse(inverterRequest: Packet) {
    const battery = new FakeBattery();
    const config = getTestConfig();
    const inverter = getInverter();
    const writePacket = vi.spyOn(inverter, 'writePacket');
    config.bms.intervalS = 0;
    const bms = new BMS(battery, inverter, getCanbusInverter(battery), config);
    await bms.init();
    bms.start();
    // Let the BMs read the battery
    await sleep(0);
    inverter.mockPacketFromInverter(inverterRequest);
    // let the BMS process the packet and respond
    await sleep(0);
    bms.stop();
    return writePacket.mock.calls;
}
