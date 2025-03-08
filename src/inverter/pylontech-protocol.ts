import { Parser } from 'binary-parser';
export const Request = new Parser()
.uint8('startByte', { assert: 0x7E })
.string('address', asciiNumber(2))
.string('command', { length: 2 })
.string('datalength', asciiNumber(2))
.buffer('data', { length: 'datalength' })
.uint8('endByte', { assert: 0x7E })

export function parseRequest(buffer: Buffer) {
    return Request.parse(buffer);
}

function asciiNumber(bytes: number) {
   return {
      length: bytes,
      formatter: (str: string) => parseInt(str, 10),
      assert: (str: string|number) => typeof str == 'string' && /^[0-9]+$/.test(str),
   };
}