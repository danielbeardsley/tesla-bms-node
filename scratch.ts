import { decodeFrame, encodeFrame } from './src/inverter/pylontech-frame';
import { generatePacket, parsePacket } from './src/inverter/pylontech-packet';
// const hexFrame = '7E 32 30 30 32 34 36 30 30 46 30 37 41 31 31 30 32 30 4630 44 34 35 30 44 34 34 30 44 34 35 30 44 34 34 30 44 34 35 30 44 34 34 30 44 33 45 30 44 34 35 30 44 34 41 30 44 34 41 30 44 34 42 30 44 34 41 30 44 34 41 30 44 34 41 30 44 34 41 30 35 30 42 43 33 30 42 43 33 30 42 43 33 30 42 43 44 30 42 43 44 30 30 30 30 43 37 32 35 46 46 46 46 30 34 46 46 46 46 30 30 30 32 30 30 43 41 35 38 30 31 32 31 31 30 45 31 41 32 0D';

// const hexFrame = '7E 32 30 31 32 34 36 36 32 30 30 30 30 46 44 41 39 0D';
// const hexFrame = '7E 32 30 31 32 34 36 30 30 38 30 30 38 30 30 30 30 30 30 30 30 46 43 32 31 0D';
// const hexFrame = '7E 32 30 31 32 34 36 30 30 38 30 30 38 44 43 44 33 35 44 43 30 30 39 43 34 30 37 45 34 42 30 46 39 38 35 0D';
const hexFrames = [
   // https://github.com/Uksa007/esphome-jk-bms-can/discussions/27
   '7E:32:30:30:32:34:36:34:32:45:30:30:32:46:46:46:44:30:39:0D',
   '7E:30:30:30:32:34:36:34:46:30:30:30:30:46:44:39:41:0D',
   "7E:30:30:35:32:34:36:34:46:30:30:30:30:46:44:39:35:0D", 
   "7E:30:30:34:32:34:36:34:46:30:30:30:30:46:44:39:36:0D",
   "7E:30:30:33:32:34:36:34:46:30:30:30:30:46:44:39:37:0D",
   "7E:30:30:32:32:34:36:34:46:30:30:30:30:46:44:39:38:0D",
   "7E:30:30:31:32:34:36:34:46:30:30:30:30:46:44:39:39:0D",
   "7E:30:30:30:32:34:36:34:46:30:30:30:30:46:44:39:41:0D",
   "7E:32:30:30:32:34:36:30:30:45:30:30:32:30:30:46:44:33:42:0D",
   "7E:30:30:30:32:34:36:34:46:30:30:30:30:46:44:39:41:0D",
   "7E:32:30:30:34:34:36:34:32:45:30:30:32:30:34:46:44:32:46:0D",
   "7E:32:30:30:32:34:36:34:32:45:30:30:32:30:32:46:44:33:33:0D",
   "7E:30:30:30:32:34:36:34:46:30:30:30:30:46:44:39:41:0D",
   "7E:30:30:35:32:34:36:34:46:30:30:30:30:46:44:39:35:0D",

   // checksum example from Pylon
   '7e 31 32 30 33 34 30 30 34 35 36 41 42 43 45 46 45 46 43 37 32 0D',

   '7E 32 30 31 32 34 36 36 32 30 30 30 30 46 44 41 39 0D',
   '7E 32 30 31 32 34 36 30 30 38 30 30 38 30 30 30 30 30 30 30 30 46 43 32 31 0D',

   // I had to delete one of the 0s in the middle
   '7E 32 30 31 32 34 36 30 30 36 30 38 32 34 36 36 46 37 32 36 33 36 35 35 46 34 43 30 30 30 3030 30 35 30 37 39 36 43 36 46 36 45 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 39 30 32 33 30 33 31 33 32 33 33 33 34 33 35 33 36 33 3733 38 33 39 36 31 36 32 36 33 36 34 36 35 36 36 33 31 33 31 33 32 33 33 33 34 33 35 33 36 33 3733 38 33 39 36 31 36 32 36 33 36 34 36 35 36 36 45 33 35 33 0D',

   '7E 32 30 31 32 34 36 36 31 30 30 30 30 46 44 41 41 0D',
   '7E 32 30 31 32 34 36 36 30 30 30 30 30 46 44 41 42 0D',

   // Example of a 74Ah battery
   '7E 32 30 30 32 34 36 34 32 45 30 30 32 30 32 46 44 33 33 0D',
   '7E 32 30 30 32 34 36 30 30 46 30 37 41 31 31 30 32 30 46 30 44 34 35 30 44 34 34 30 44 34 35 30 44 34 34 30 44 34 35 30 44 34 34 30 44 33 45 30 44 34 35 30 44 34 41 30 44 34 41 30 44 34 42 30 44 34 41 30 44 34 41 30 44 34 41 30 44 34 41 30 35 30 42 43 33 30 42 43 33 30 42 43 33 30 42 43 44 30 42 43 44 30 30 30 30 43 37 32 35 46 46 46 46 30 34 46 46 46 46 30 30 30 32 30 30 43 41 35 38 30 31 32 31 31 30 45 31 41 32 0D',
   //===============================
   // Sunsynk Protocl Doc
   // Checksum example
   '7e 31 32 30 33 34 30 30 34 35 36 41 42 43 45 46 45 46 43 37 31 0D',

   // Battery info cmd 0x61
   '7E 32 30 31 32 34 36 36 31 30 30 30 30 46 44 41 41 0D',
   '7E 32 30 31 32 34 36 30 30 38 30 36 32 32 45 35 33 36 31 41 38 36 32 30 39 44 34 30 42 37 34 36 32 36 31 30 44 42 38 30 30 33 34 30 43 42 42 30 30 31 34 30 42 41 41 30 42 42 37 30 30 33 35 30 42 39 44 30 30 31 35 30 42 41 41 30 42 42 38 30 30 33 36 30 42 39 43 30 30 31 36 30 42 41 4130 42 42 36 30 30 33 37 30 42 39 45 30 30 31 37 45 38 36 32 0D',

   '7E 32 30 31 32 34 36 36 33 30 30 30 30 46 44 41 38 0D',
   '7E 32 30 31 32 34 36 30 30 38 30 30 38 44 43 44 33 35 44 43 30 30 39 43 34 30 37 45 34 42 30 46 39 38 35 0D',

   // Had to delete one of the 0s in the middle to get it to be an even number of hex chars
   '7E 32 30 31 32 34 36 36 34 30 30 30 30 46 44 41 37 0D',
   '7E 32 30 31 32 34 36 30 30 30 30 30 30 46 44 42 31 0D',

];

hexFrames.forEach(roundTrip)

process.exit();

function roundTrip(hexFrame: string) {
   try {
      const justHex = hexFrame.replace(/[^0-9a-fA-F]/g, '');
   const frame = Buffer.from(justHex, 'hex'); 
      console.log("=========================================");
      console.log("===   " + frame.toString() + "   ===");
   const decodedFrame = decodeFrame(frame);
   const reencodedFrame = encodeFrame(decodedFrame);
   console.log("decoded   Frame:  " + decodedFrame.toString());
   console.log("original  Frame: " + frame.toString());
   const packet = parsePacket(decodedFrame);
   const reendcodedPacket = generatePacket(packet.address, packet.command, packet.data);
   const reencodedPacketFrame = encodeFrame(reendcodedPacket);

   console.log("just hex length: " + justHex.length);
   console.log("reencoded Frame: " + reencodedFrame.toString());
   console.log("packet    Frame: " + reencodedPacketFrame.toString());
   console.log("packet:", packet);

   if (reencodedFrame.toString() !== frame.toString()) {
      console.error("ERROR: Failed frame decode / encode");
   } else {
      console.log("SUCCESS: Frame decode / encode");
   }

   if (decodedFrame.toString() !== reendcodedPacket.toString()) {
      console.error("ERROR: Failed packet decode / encode");
   } else {
      console.log("SUCCESS: Packet decode");
   }

} catch (e) {
   console.error(e);
}
}
