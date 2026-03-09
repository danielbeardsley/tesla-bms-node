export type ChargeParameters = {
   chargeCurrentLimit: number;
   dischargeCurrentLimit: number;
   chargingEnabled: boolean;
   dischargingEnabled: boolean;
   chargeFromGrid?: boolean;
   _meta?: Record<string, unknown>;
};

export interface ChargingModule {
   getChargeDischargeInfo(): ChargeParameters;
   getStateOfCharge(): number;
}
