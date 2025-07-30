import { Transform } from 'stream';

type Frame = {
   ChecksumValid?: boolean;
} & Record<string, string|number>;

const checksum = (blockBuffer: Buffer) => {
   return blockBuffer.reduce((prev, curr) => {
      return (prev + curr) & 255;
   }, 0);
};

const parseValues = (frame: Frame) => {
   for (const key in frame) {
      switch (key) {
         case "V":
         case "V2":
         case "V3":
         case "VS":
         case "VM":
         case "DM":
         case "VPV":
         case "PPV":
         case "I":
         case "I2":
         case "I3":
         case "IL":
         case "P":
         case "CE":
         case "SOC":
         case "TTG":
         case "AR":
         case "OR":
         case "H1":
         case "H2":
         case "H3":
         case "H4":
         case "H5":
         case "H6":
         case "H7":
         case "H8":
         case "H9":
         case "H10":
         case "H11":
         case "H12":
         case "H13":
         case "H14":
         case "H15":
         case "H16":
         case "H17":
         case "H18":
         case "H19":
         case "H20":
         case "H21":
         case "H22":
         case "H23":
         case "ERR":
         case "CS":
         case "BMV":
         case "FW":
         case "FWE":
         case "PID":
         case "HSDS":
         case "MODE":
         case "AC_OUT_V":
         case "AC_OUT_I":
         case "AC_OUT_S":
         case "WARN":
         case "MPPT":
            frame[key] = parseInt(String(frame[key]));
            break;
      }
   }

   return frame;
};

const DELIMITER = Buffer.from([0x0d, 0x0a]);

class VEDirectParser extends Transform {
   private buffers: Buffer[] = [];
   private blk: Frame

   public packets: number = 0;
   public badPackets: number = 0;

   constructor() {
      super({
         readableObjectMode: true,
      });

      this.blk = {};
   }

   _transform(chunk: Buffer, _encoding: string, cb: (err?: Error | null) => void) {
      const [key, val] = chunk.toString().split("\t");

      // What is this about?
      if (key[0] === ":") {
         return cb();
      }

      this.buffers.push(DELIMITER, chunk);

      if (key === "Checksum") {
         this.packets++;
         const fullBlock = Buffer.concat(this.buffers);
         const checksumValue = checksum(fullBlock);
         this.blk.ChecksumValid = checksumValue === 0;
         this.push(parseValues(this.blk));
         this.buffers = [];
         this.blk = {};
      } else {
         this.blk[key] = val;
      }

      cb();
   }
}

export default VEDirectParser;
