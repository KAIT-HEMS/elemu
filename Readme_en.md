# ECHONET Lite Device Emulator

Kanagawa Institute of Technology, Smart House Research Center 2024.12.04

## Revision history  

Date | Version  | Description
:-----------|:-----|:-----
2019.03.28 | V20190328 | First official release
2019.11.28 | V20191103 | Support EL device description V3.1
2019.12.07 | V20191207 | Fixed a following bug<br>Storage Battery(0x027D) EPC=0xAA, GET value is wrong after SET 0x00000000.
2019.12.22 | V20191222 | Fixed a following bug<br>Controller(0x05FF) does not display detailed information of discovered devices, when a device return a manufacture code that is not registered in the table.
2020.06.09 | V20191222 | Update Device Description to 3.1.6r3_sub to support Release M
2022.01.05 | V20220105 | Change to MRA from Device Description(\*1)</br>Add a function to disable internal clock for a time-escalated emulation(\*2)
2022.10.03 | V1.0.0 | - Updated property value of EPC:0x82 from "A" (0x41) to "a" (0x61) in case of Release A</br>- Removed "O" from options of Release Version at Register a new EOJ screen</br>- Added a method to launch this program by "npm start"
2023.12.18 | V1.1.0 | - Updated MRA to V1.2.0 that supports Appendix Release Q rev.1
2024.12.04 | V1.2.0 | - Updated MRA to V1.3.0 that supports Appendix Release R rev.2<br>- Improved device discovery performance<br>- Ignored EDT values if the ESV is "0x62: Get" in the "Send a Packet" widget<br>- Added an option that filters some packets in the "Packet Monitor" widget<br>- Added a pause button in the "Packet Monitor" widget

(\*1) Device Description data is created and maintained by KAIT. This data was transfered to ECHONET Consortium in 2021. After some updates and modifications of the data structure and data itself, ECHONET Consortium released the data as [Machine Readable Appendix (MRA)](https://echonet.jp/spec_g/#standard-08) on Dec. 1st 2021.

(\*2) Please refer to an operation manual for details

## Abstract

- ECHONET Lite Device Emlator can emulate more than 30 types of devices with full support of properties.

## Required environment

- It runs on Windows, MacOS and Linux. Please refer user manual for installation and usage.

## Functions as a controller

- Create an ECHONET Lite message, send the message
- Parse received ECHONET Lite message
- Log sent and received messages

When you run a controller, remove all devices except node profile, then create a controller node.

## Implementation of logics on properties

The following properties have implementation of logics.

### PV Power Generation: 0x0279

|EPC   |Property name|Logic 
|:-----|:------------|:-----
| 0xE2 | Resetting cumulative amount of electric energy generated |Reset the value of 0xE1 to 0 by Set(0xE2)
| 0xE4 | Resetting cumulative amount of electric energy sold |Reset the value of 0xE3 to 0 by Set(0xE4)

### Fuel Cell: 0x027C

|EPC   |Property name|Logic 
|:-----|:------------|:-----
| 0xC6 | Cumulative power generation output reset setting |Reset the value of 0xC5 to 0 by Set(0xC6)
| 0xC9 | Cumulative gas consumption reset setting |Reset the value of 0xC8 to 0 by Set(0xC9)
| 0xCE | In-house cumulative power consumption reset |Reset the value of 0xCD to 0 by Set(0xCE)

### Storage Battery: 0x027D

|EPC   |Property name|Logic 
|:-----|:------------|:-----
| 0xD7| Measured cumulative discharging electric energy reset setting |Reset the value of 0xD6 to 0 by Set(0xD7)
| 0xD9| Measured cumulative charging electric energy reset setting |Reset the value of 0xD8 to 0 by Set(0xD9)

### EV Charger and Discharger: 0x027E

|EPC   |Property name|Logic 
|:-----|:------------|:-----
| 0xD7 | Cumulative discharge electric energy reset setting |Reset the value of 0xD6 to 0 by Set(0xD7)
| 0xD9 | Cumulative charge electric energy reset setting |Reset the value of 0xD8 to 0 by Set(0xD9)

### EV Charger: 0x02A1

|EPC   |Property name|Logic 
|:-----|:------------|:-----
| 0xD9 | Cumulative amount of charging electric energy reset setting |Reset the value of 0xD8 to 0 by Set(0xD9)

### Power Distribution Board: 0x0287

|EPC   |Property name|Logic 
|:-----|:------------|:-----
|0xB3  |Measured cumulative amount of electric power consumption list(simplex)|The value by 0xB2
|0xB5  |Measured instantaneous current list(simplex)|The value by 0xB4
|0xB7  |Measured instantaneous power consumption list(simplex)|The value by 0xB6
|0xBA  |Measured cumulative amount of electric power consumption list(duplex)|The value by 0xB9 
|0xBC  |Measured instantaneous current list(duplex)|The value by 0xBB 
|0xBE  |Measured instantaneous power consumption list(duplex)|The value by 0xBD 
|0xC3  |Historical data of measured cumulative amounts of electric energy(normal direction)|The value by 0xC5
|0xC4  |Historical data of measured cumulative amounts of electric energy(reverse direction)|The value by 0xC5 

### Low Voltage Smart Electric Energy Meter: 0x0288

|EPC   |Property name|Logic 
|:-----|:------------|:-----
|0xE2  |Historical data of measured cumulative amounts of electric energy 1(normal direction)|The value by 0xE5 
|0xE4  |Historical data of measured cumulative amounts of electric energy 1(reverse direction)|The value by 0xE5 
|0xEC  |Historical data of measured cumulative amounts of electric energy 2(normal and reverse direction)|The value by 0xED 

### High Voltage Smart Electric Energy Meter: 0x028A

|EPC   |Property name|Logic 
|:-----|:------------|:-----
|0xC6  |Historical data of measured electric power demand|The value by 0xE1
|0xCE  |Historical data of measurement data of cumulative amount of reactive electric power consumption(lag) for power factor measurement|The value by 0xE1
|0xE7  |Historical data of measured cumulative amount of active electric energy|The value by 0xE1

## FAQ

- Q:Following error message is diplayed on the console screen.
- A:Terminate an application (such as SSNG for Node.js) that utilize 3610 port before launching ECHONET Lite Device Emulator.  

```
[SY] Starting the device...                                            [  NG  ] 
{ Error: bind EADDRINUSE 0.0.0.0:3610
    at Object._errnoException (util.js:992:11)
    at _exceptionWithHostPort (util.js:1014:20)
    at _handle.lookup (dgram.js:266:18)
    at _combinedTickCallback (internal/process/next_tick.js:141:11)
    at process._tickCallback (internal/process/next_tick.js:180:9)
  code: 'EADDRINUSE',
  errno: 'EADDRINUSE',
  syscall: 'bind',
  address: '0.0.0.0',
  port: 3610 }
```

- Q:UDP communication is wrong on Windows OS.
- Q:Multicasting is wrong on Windows OS.
- A:Check firewall settings if permission of communication is set to Node.js.

- Q:I want to utileze a device object that is not on the list when I add a new device.
- A:Create MRA data for the device and include it in the emulator.

## License

MIT license

## Contact

contact@sh-center.org