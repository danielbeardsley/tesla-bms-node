import { ChargeInfo } from "src/inverter/commands/get-charge-discharge-info";

export interface ChargingModule {
   getChargeDischargeInfo(): ChargeInfo;
}