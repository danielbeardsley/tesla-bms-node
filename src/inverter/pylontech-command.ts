
export enum Command {
   GetProtocolVersion = 0x4F,
   GetManfuacturerInfo = 0x51,
   GetBatteryValues = 0x42,
}

export enum ReturnCode {
   Normal = 0x00,
   Version_Error = 0x01,
   Checksum_Error = 0x02,
   LChecksum_Error = 0x03,
   CID2_Invalid = 0x04,
   Command_Format_Error = 0x05,
   Invalid_Data = 0x06,
   Address_Error = 0x90,
   Communication_Error = 0x91,
}

export function returnCodeToMessage(returnCode: ReturnCode): string {
   switch (returnCode) {
      case ReturnCode.Normal:
         return 'Normal';
      case ReturnCode.Version_Error:
         return 'Version Error';
      case ReturnCode.Checksum_Error:
         return 'Checksum Error';
      case ReturnCode.LChecksum_Error:
         return 'LChecksum Error';
      case ReturnCode.CID2_Invalid:
         return 'CID2 Invalid';
      case ReturnCode.Command_Format_Error:
         return 'Command Format Error';
      case ReturnCode.Invalid_Data:
         return 'Invalid Data';
      case ReturnCode.Address_Error:
         return 'Address Error';
      case ReturnCode.Communication_Error:
         return 'Communication Error';
   }
}
