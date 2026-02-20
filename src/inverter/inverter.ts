import { Packet } from './pylontech-packet';
import { PacketStats } from '../comms/packet-stats';

export interface Inverter {
   readPacket(timeout?: number): Promise<Packet>;
   writePacket(packet: Buffer): Promise<void>;
   close(): void;
   packetStats: PacketStats;
}
