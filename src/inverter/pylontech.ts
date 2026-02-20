import { SerialWrapper } from "../comms/serial-wrapper";
import { inverterLogger as logger } from "../logger";
import { decodeFrame, encodeFrame } from "./pylontech-frame";
import { Packet, parsePacket } from "./pylontech-packet";
import { PacketStats } from "../comms/packet-stats";

const PLYONTECH_DELIMITER = 0x0D; // carriage return char \r

export class Pylontech {
   private serial: SerialWrapper;
   public readonly packetStats = new PacketStats();

   constructor(serial: SerialWrapper) {
      this.serial = serial;
   }

   close() {
      logger.info('Closing Pylontech RS485 serial port');
      this.serial.close();
   }

   readPacket(timeout?: number): Promise<Packet> {
      return this.serial.readTillDelimiter(PLYONTECH_DELIMITER, timeout || 0)
      .then(frame => {
         this.packetStats.incrementTotal();
         const data = decodeFrame(Buffer.from(frame));
         logger.silly('Decoded data: %s', data.toString());
         const packet = parsePacket(data);
         logger.debug('Parsed packet %j', packet);
         return packet;
      }).catch(err => {
         this.packetStats.incrementBad();
         throw err;
      });;
   }

   async writePacket(packet: Buffer): Promise<void> {
      logger.silly('Writing packet %s', packet.toString());
      const frame = encodeFrame(packet);
      await this.serial.write(frame);
   }
}