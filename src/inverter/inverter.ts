import { Packet } from './pylontech-packet';

export interface Inverter {
   readPacket(timeout?: number): Promise<Packet>;
   writePacket(packet: Buffer): Promise<void>;
}