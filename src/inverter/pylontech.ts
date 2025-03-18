import { SerialWrapper } from "../comms/serial-wrapper";
import { inverterLogger as logger } from "../logger";
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
         logger.silly('Received frame: %s', frame);
         const data = decodeFrame(Buffer.from(frame));
         logger.silly('Decoded data: %s', data.toString());
         const packet = parsePacket(data);
         logger.debug('Parsed packet %j', packet);
         return packet;
      });
   }

   async writePacket(packet: Buffer): Promise<void> {
      logger.debug('Writing packet of length %d', packet.length);
      logger.silly('Writing packet %s', packet.toString());
      const frame = encodeFrame(packet);
      await this.serial.write(frame);
   }
}