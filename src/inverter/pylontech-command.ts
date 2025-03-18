
export enum Command {
   GetBatteryValues = 0x42, // 66
   GetAlarmInfo = 0x44, // 68
   GetSystemParameters = 0x47, // 71
   GetProtocolVersion = 0x4F, // 79
   GetManfuacturerInfo = 0x51, // 81
   GetChargeDischargeInfo = 0x92, // 146
   GetSerialNumber = 0x93, // 147
   SetChargeParameters = 0x94, // 148
   TurnOff = 0x95, // 149
   GetFirmwareInfo = 0x96, // 150
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
