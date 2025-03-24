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
   * Charge
      * Charge at a higer voltage and stop when the current reaches some
        smaller amount (or the cells are at some voltage)
   * Alarms
      * Add alarms for over voltage, under voltage, over current, etc
      * Figure out if the alarms are really warnings, or if they cause
        the inverter to shut down the output
   * Visualize the charge routine in some way for tweaking and debugging

* Tests to add or improve
   * BMS
      * Mock the BatteryI interface and test and assert the actions
        taken or responses to pylon packets
   * Mock the RS485 comms over the serial port
      * Assert the correct pylon packets are sent and received

* Reporting
   * Current Values
      * Expose lots of the current state via a json API
   * History
      * Decide how and where to store the history of the battery state
      * Decide how and where to store the history of the inverter state
   * Logging
      * Ensure errors easily identified in the logs, all using logger.error()
