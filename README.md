### Tesla BMS Node
Thsi is software that talks to Tesla battery moules (via a serial port)
and communicates to an inverter (via Pylon protocol over RS485) about how and
when to charge and discharge the battery.


### TODO
* Functionality
   * Allow scheduling discharge allowed time (i.e. 3pm -> 8am)
      * This enables saving up solar shifting load to off-peak times
   * Figure out a way of allowing to dig deeper into the battery SOC if we have
     a power outage
      * i.e. normally keep it between 30% and 80%, but if we have a power outage,
        allow going down to 10% to extend the time we have power
      * In the winter we have less solar and so spend most of the time at the
        bottom of the capacity range, so being able to dig deeper would be useful
      * Possibly detect power outage by listening for inverter packets over the
        wifi network?
        * CON: wifi down would be indistinguishable from power outage though
        * PRO: simple
      * Maybe just allow extending capacity range manually via the API for some
        period of time?
