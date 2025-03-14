import { generatePacket } from '../pylontech-packet';
import { Command } from '../pylontech-command';

export const Response = {
   generate: (address: number): Buffer => {
      return generatePacket(address, Command.GetProtocolVersion);
   }
}