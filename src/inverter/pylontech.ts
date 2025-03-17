import { SerialWrapper } from "../comms/serial-wrapper";
import { logger } from "../logger";
import { decodeFrame, encodeFrame } from "./pylontech-frame";
import { Packet, parsePacket } from "./pylontech-packet";

const PLYONTECH_DELIMITER = 0x0D; // carriage return char \r

export class Pylontech {
   private serial: SerialWrapper;

   constructor(serial: SerialWrapper) {
      this.serial = serial;
   }

   readPacket(timeout?: number): Promise<Packet> {
      return this.serial.readTillDelimiter(PLYONTECH_DELIMITER, timeout || 0)
      .then(frame => {
         logger.debug('Inverter: Received frame: %s', frame);
         const data = decodeFrame(Buffer.from(frame));
         logger.debug('Inverter: Decoded data: %s', data.toString());
         const packet = parsePacket(data);
         logger.debug('Inverter: Parsed packet %j', packet);
         return packet;
      });
   }

   async writePacket(packet: Buffer): Promise<void> {
      logger.debug('Writing packet of length %d', packet.length);
      const frame = encodeFrame(packet);
      await this.serial.write(frame);
   }
}