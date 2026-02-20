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
import { Downtime } from '../history/downtime';
import { PacketStats } from '../comms/packet-stats';
import { StorageInterface, type StorageValues } from '../storage';
import { createApp } from '../server/server';

describe('BMS', () => {
    it('Should read from the battery immediately', async () => {
        const battery = new FakeBattery();
        const readAllSpy = vi.spyOn(battery, 'readAll');
        const inverter = getInverter();
        const bms = new BMS(battery, inverter, getCanbusInverter(battery), getTestConfig(), fakeStorage());
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

        const bms = new BMS(battery, inverter, getCanbusInverter(battery), config, fakeStorage());
        await bms.init();
        readAll.mockClear();
        bms.start();
        await sleep(0);
        await sleep(0);
        expect(readAll).toHaveBeenCalledTimes(2);
        // Once when the service starts and once for each loop
        expect(stopBalancing).toHaveBeenCalledTimes(3);
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

    it('Should call canbus.open()', async () => {
        const {bms, open} = await getBmsWithCanbus();
        expect(open).toHaveBeenCalled();
        bms.stop();
    });

    it('Should call canbus.sendBatteryInfoToInverter()', async () => {
        const {bms, sendBatteryInfoToInverter} = await getBmsWithCanbus();
        await sleep(0);
        expect(sendBatteryInfoToInverter.mock.calls).toMatchInlineSnapshot(`
          [
            [
              {
                "_meta": {
                  "batteryInfoRecent": false,
                  "safeChargeInfo": {
                    "chargeCurrentLimit": 0,
                    "chargingEnabled": true,
                    "dischargeCurrentLimit": 100,
                    "dischargingEnabled": false,
                  },
                  "safeTemp": true,
                },
                "chargeCurrentLimit": 0,
                "chargeFromGrid": false,
                "chargeVoltLimit": 54.6,
                "chargingEnabled": false,
                "dischargeCurrentLimit": 100,
                "dischargeVoltLimit": 40,
                "dischargingEnabled": false,
              },
            ],
          ]
        `);
        bms.stop();
    });
});

describe('BMS History', () => {
    it('Should expose module balancing state in /current', async () => {
        const config = getTestConfig();
        const port = config.history.httpPort = 8090;
        const inverter = getInverter();
        const battery = new FakeBattery();
        battery.modules[1].balancing = [false, false, true, true, false, false];
        const app = createApp();
        const server = app.listen(port);
        const bms = new BMS(battery, inverter, getCanbusInverter(battery), config, fakeStorage(), app);
        await bms.init();
        bms.start();
        await sleep(0);
        const result = await fetch(`http://127.0.0.1:${port}/current`);
        const current = await result.json() as { modules: { id: number, balancing: boolean[] }[] };
        const module1 = current.modules.find(m => m.id === 1)!;
        const module2 = current.modules.find(m => m.id === 2)!;
        expect(module1.balancing).toEqual([false, false, true, true, false, false]);
        expect(module2.balancing).toEqual([false, false, false, false, false, false]);
        bms.stop();
        server.close();
    });

    it('Should serve history recordings', async () => {
        const config = getTestConfig();
        const port = config.history.httpPort = 8089;
        const inverter = getInverter();
        const battery = new FakeBattery();
        battery.temperatureRange = {min: 18, max: 21, spread: 3};
        battery.voltageRange = {min: 3.6, max: 3.7, spread: 0.1};
        battery.voltage = 48;
        battery.current = 2;
        const app = createApp();
        const server = app.listen(port);
        const bms = new BMS(battery, inverter, getCanbusInverter(battery), config, fakeStorage(), app);
        await bms.init();
        bms.start();
        // Let the BMs read the battery and store the history
        await sleep(0);
        const result = await fetch(`http://127.0.0.1:${port}/history`);
        const json = await result.json() as HistoryColumns & { timestamps?: number[] };
        delete json.timestamps;
        expect(json).toEqual({
            batteryVolts: [48],
            batteryAmps: [2],
            batteryWatts: [96],
            batteryCellVoltsMin: [3.6],
            batteryCellVoltsMax: [3.7],
            batteryTempMin: [18],
            batteryTempMax: [21],
            tesla: packetStats(0,0),
            rs485: packetStats(0,0),
            shunt: packetStats(0,0),
            canbus: packetStats(0,0),
        });
        // Let the BMs read the battery and store the history
        const resultCurrent = await fetch(`http://127.0.0.1:${port}/current`);
        const current = await resultCurrent.json();
        (current as ({timeSinceInverterComms: number|null})).timeSinceInverterComms = null; // we don't test this
        (current as ({downtime: object|null})).downtime = null; // we don't test this
        (current as ({history: object|null})).history = null; // we don't test this
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
            amps: 2,
            watts: 96,
            modules: [
                {
                    cellVoltages: [3.7, 3.7, 3.7, 3.7, 3.7, 3.7],
                    temperatures: [21, 21, 21, 21, 21, 21, 21],
                    balancing: [false, false, false, false, false, false],
                    id: 1,
                },
                {
                    cellVoltages: [3.7, 3.7, 3.7, 3.7, 3.7, 3.7],
                    temperatures: [21, 21, 21, 21, 21, 21, 21],
                    balancing: [false, false, false, false, false, false],
                    id: 2,
                }
            ],
            stateOfCharge: 0,
            modulesInSeries: [[0,1]],
            timeSinceInverterComms: null,
            storage: {
               lastFullCharge: expect.any(Number),
            },
            downtime: null,
            history: null,
            shunt: {},
        });
        bms.stop();
        server.close();
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
        close() { },
        packetStats: new PacketStats(),
    };
}

// ===============
function getCanbusInverter(_battery: BatteryI) {
   return {
     async open(): Promise<void> { },
     close(): void { },
     sendBatteryInfoToInverter(_chargeData: ChargeInfo) { },
     getTsOflastInverterMessage() { return 0 },
     downtime: new Downtime('/p', 'canbus', 1000),
     packetStats: new PacketStats(),
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

async function getBmsWithCanbus() {
    const battery = new FakeBattery();
    const config = getTestConfig();
    const inverter = getInverter();
    const canbusInverter = getCanbusInverter(battery);
    const open = vi.spyOn(canbusInverter, 'open');
    const sendBatteryInfoToInverter = vi.spyOn(canbusInverter, 'sendBatteryInfoToInverter');
    config.inverter.canbusSerialPort.transmitIntervalMs = 0;
    const bms = new BMS(battery, inverter, canbusInverter, config, fakeStorage());
    await bms.init();
    bms.start();
    return { bms, battery, inverter, canbusInverter, open, sendBatteryInfoToInverter };
}

async function getBmsResponse(inverterRequest: Packet) {
    const battery = new FakeBattery();
    const config = getTestConfig();
    const inverter = getInverter();
    const writePacket = vi.spyOn(inverter, 'writePacket');
    config.bms.intervalS = 0;
    const bms = new BMS(battery, inverter, getCanbusInverter(battery), config, fakeStorage());
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

function packetStats(total: number, bad: number) {
   return {
      total: [total],
      bad: [bad],
   };
}

function fakeStorage() {
   return {
      get: () => ({
         lastFullCharge: Date.now(),
      } as StorageValues),
      update: (_values: Partial<StorageValues>) => {}
   } as StorageInterface;
}

