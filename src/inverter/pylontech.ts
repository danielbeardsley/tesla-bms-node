import { SerialWrapper } from "src/battery/serial-wrapper";

export type BatteryChargeParams = {
    chargeCurrent: number;
    chargeVoltage: number;
    maxDischargeCurrent: number;
}

export class Pylontech {
    constructor(private readonly serialWrapper : SerialWrapper) {
    }

    // https://github.com/Sleeper85/esphome-yambms/blob/da658defd8f7b61be50552de3cf36321c70f0a60/packages/yambms/yambms_canbus.yaml#L72
    async sendBatteryChargeParams() {
        const data = await this.serialWrapper.readData();
        return data;
    }
}