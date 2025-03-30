import { describe, it, expect, vi } from 'vitest';
import { Packet } from '../inverter/pylontech-packet';
import { BMS } from './bms';
import { FakeBattery } from './fake-battery';
import { Config } from '../config';
import { orThrow, sleep } from '../utils';
import { Command } from 'src/inverter/pylontech-command';

describe('BMS', () => {
    it('Should read from the battery immediately', async () => {
        const battery = new FakeBattery();
        const initSpy = vi.spyOn(battery, 'init');
        const readAllSpy = vi.spyOn(battery, 'readAll');
        const inverter = getInverter();
        const bms = new BMS(battery, inverter, getConfig());
        await bms.init();
        expect(initSpy).toHaveBeenCalled();
        expect(readAllSpy).toHaveBeenCalled();
    });

    it('Should read from the battery in a loop', async () => {
        const battery = new FakeBattery();
        const readAll = vi.spyOn(battery, 'readAll');
        const balance = vi.spyOn(battery, 'balance');
        const stopBalancing = vi.spyOn(battery, 'stopBalancing');
        const config = getConfig();
        const inverter = getInverter();
        config.bms.intervalS = 0;

        const bms = new BMS(battery, inverter, config);
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
        const expectedResponse = Buffer.from("20024600208611020C0E740E740E740E740E740E740E740E740E740E740E740E740E0B7D0B7D0B7D0B7D0B7D0B7D0B7D0B7D0B7D0B7D0B7D0B7D0B7D0B7D00000000000002EA600000");
        await testAssertRequestResponse(inverterRequest, expectedResponse);
    });

    it('Should not respond to requests to a different battery', async () => {
        const inverterRequest = getRequestPacket(Command.GetBatteryValues, 3);
        const expectedResponse = null;
        await testAssertRequestResponse(inverterRequest, expectedResponse);
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

async function testAssertRequestResponse(inverterRequest: Packet, expectedResponse: Buffer|null) {
    const battery = new FakeBattery();
    const config = getConfig();
    const inverter = getInverter();
    const writePacket = vi.spyOn(inverter, 'writePacket');
    config.bms.intervalS = 0;
    const bms = new BMS(battery, inverter, config);
    await bms.init();
    bms.start();
    // Let the BMs read the battery
    await sleep(0);
    inverter.mockPacketFromInverter(inverterRequest);
    // let the BMS process the packet and respond
    await sleep(0);
    if (expectedResponse) {
        expect(writePacket).toHaveBeenCalledWith(expectedResponse);
        console.log("Response: ", writePacket.mock.calls[0][0].toString());
    } else {
        expect(writePacket).not.toHaveBeenCalled();
    }
    bms.stop();
}