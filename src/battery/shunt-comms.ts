import { Transform } from 'stream';

type Frame = Record<string, string|number>;

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

class VEDirectParser extends Transform {
   private buf: Buffer;
   private blk: Frame
   constructor() {
      super({
         readableObjectMode: true,
      });

      this.buf = Buffer.alloc(0);
      this.blk = {};
   }

   _transform(chunk: Buffer, _encoding: string, cb: (err?: Error | null) => void) {
      const [key, val] = chunk.toString().split("\t");

      if (key[0] === ":") {
         return cb();
      }

      this.buf = Buffer.concat([this.buf, Buffer.from([0x0d, 0x0a]), chunk]);

      if (key === "Checksum") {
         if (checksum(this.buf) === 0) {
            this.push(parseValues(this.blk));
         }

         this.buf = Buffer.alloc(0);
         this.blk = {};
      } else {
         this.blk[key] = val;
      }

      cb();
   }
}

export default VEDirectParser;
