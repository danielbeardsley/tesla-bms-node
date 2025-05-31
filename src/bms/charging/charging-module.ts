export type ChargeParameters = {
   chargeCurrentLimit: number;
   dischargeCurrentLimit: number;
   chargingEnabled: boolean;
   dischargingEnabled: boolean;
};

export interface ChargingModule {
   getChargeDischargeInfo(): ChargeParameters;
}
