### Tesla BMS Node
Thsi is software that talks to Tesla battery moules (via a serial port)
and communicates to an inverter (via Pylon protocol over RS485) about how and
when to charge and discharge the battery.


### TODO
* Functionality
   * Discharge
      * Allow switching charge contrller implementations
      * Try to compute real voltage using discharge current from the inverter
        and the current voltage
      * See if moduleVolts or the sum-of-cells is closer to the truth
   * Charge
      * Charge at a higer voltage and stop when the current reaches some
        smaller amount (or the cells are at some voltage)
   * Alarms
      * Add alarms for over voltage, under voltage, over current, etc
      * Figure out if the alarms are really warnings, or if they cause
        the inverter to shut down the output
   * Capacity
      * Model true cell volts by taking into account the measured volts
        and the discharge / charge current

* Tests to add or improve
   * BMS
      * Mock the BatteryI interface and test and assert the actions
        taken or responses to pylon packets
   * Mock the RS485 comms over the serial port
      * Assert the correct pylon packets are sent and received

* Reporting
   * Current Values
      * Expose lots of the current state via a json API
   * Logging
      * Ensure errors easily identified in the logs, all using logger.error()
