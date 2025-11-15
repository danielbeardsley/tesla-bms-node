export type ChargeParameters = {
   chargeCurrentLimit: number;
   dischargeCurrentLimit: number;
   chargingEnabled: boolean;
   dischargingEnabled: boolean;
   chargeFromGrid?: boolean;
};

export interface ChargingModule {
   getChargeDischargeInfo(): ChargeParameters;
   getStateOfCharge(): number;
}
