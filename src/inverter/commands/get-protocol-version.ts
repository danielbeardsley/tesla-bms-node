import { generatePacket } from '../pylontech-packet';
import { ReturnCode } from '../pylontech-command';

export const Response = {
   generate: (address: number): Buffer => {
      return generatePacket(address, ReturnCode.Normal);
   }
}