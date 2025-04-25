declare module '@bencevans/ve.direct/parser' {
   import {Transform} from 'stream';

   declare class VEDirectParser extends Transform {
      constructor();
      _transform(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void): void;
   }

   export default VEDirectParser;
}

