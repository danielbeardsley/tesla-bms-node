const net = require('net');

const Protocol = {
  WriteSingle: 1,
  WriteMulti: 2,
}

const TcpFunction = {
  Heartbeat: 193,
  TranslatedData: 194,
  ReadParam: 195,
  WriteParam: 196,
} // }}}

const DeviceFunction = {
  ReadHold: 3,
  ReadInput: 4,
  WriteSingle: 6,
  WriteMulti: 16,
  // UpdatePrepare = 33
  // UpdateSendData = 34
  // UpdateReset = 35
  // ReadHoldError = 131
  // ReadInputError = 132
  // WriteSingleError = 134
  // WriteMultiError = 144
} // }}}

// Define the inverter's IP details
const HOST = '192.168.1.213';
const PORT = 8000;
// Serial numbers
const DATALOG_SERIAL_NUMBER = 'DJ42200374';
const INVERTER_SERIAL_NUMBER = '4263740453';


// Helper function to create a heartbeat packet
function createHeartbeatPacket(serialNumber) {
  const packet = Buffer.alloc(13); // Correct size for heartbeat packet
  packet.writeUInt16LE(0xa11a, 0); // Prefix
  packet.writeUInt16LE(2, 2); // Protocol version
  packet.writeUInt16LE(13, 4); // Packet length (13 bytes)
  packet.writeUInt8(1, 6); // Address
  packet.writeUInt8(0xc1, 7); // TCP Function: Heartbeat
  packet.write(serialNumber, 8, 10, 'ascii'); // Serial Number
  return packet;
}

// Helper function to create a translated data packet
function createWriteRegisterPacket(serialNumber, inverterSerialNumber, dataLength) {
  const packet = Buffer.alloc(19 + dataLength); // Adjust size for data length
  packet.writeUInt16LE(0xa11a, 0); // Prefix
  packet.writeUInt16LE(2, 2); // Protocol version
  packet.writeUInt16LE(19 + dataLength, 4); // Packet length
  packet.writeUInt8(1, 6); // Address
  packet.writeUInt8(TcpFunction.WriteParam, 7); // TCP Function
  packet.write(serialNumber, 8, 10, 'ascii'); // Serial Number
  packet.writeUInt8(0, 18); // Address (0 for writing, 1 for reading)
  packet.writeUInt8(DeviceFunction.WriteSingle, 19); // Device Function
  packet.write(inverterSerialNumber, 20, 10, 'ascii'); // Inverter Serial Number
  packet.writeUInt16LE(dataLength, 30); // Data Length
  // Write payload data starting at offset 32
  return packet;
}
/**
 * 
 * let data_bytes = data.bytes();
        let data_length = data_bytes.len() as u8;
        let frame_length = (18 + data_length) as u16;

        // debug!("data_length={}, frame_length={}", data_length, frame_length);

        let mut r = vec![0; frame_length as usize];

        r[0] = 161;
        r[1] = 26;
        r[2..4].copy_from_slice(&data.protocol().to_le_bytes());
        r[4..6].copy_from_slice(&(frame_length - 6).to_le_bytes());
        r[6] = 1; // unsure what this is, always seems to be 1
        r[7] = data.tcp_function() as u8;

        r[8..18].copy_from_slice(&data.datalog().data());
        // WIP - trying to work out how to learn the inverter sn
        //r[8..18].copy_from_slice(&[0; 10]);

        r[18..].copy_from_slice(&data_bytes);

        r} dataLength 
 */

        /*
        let mut data = vec![0; 16];

        // data[2] (address) is 0 when writing to inverter, 1 when reading from it
        data[3] = self.device_function as u8;

        // experimental: looks like maybe you don't need to fill this in..
        data[4..14].copy_from_slice(&self.inverter.data());
        //data[4..14].copy_from_slice(&[0; 10]);

        data[14..16].copy_from_slice(&self.register.to_le_bytes());

        if self.device_function == DeviceFunction::WriteMulti {
            let register_count = self.pairs().len() as u16;
            data.extend_from_slice(&register_count.to_le_bytes());
        }

        if Self::has_value_length_byte(PacketSource::Client, self.protocol(), self.device_function)
        {
            let len = self.values.len() as u8;
            data.extend_from_slice(&[len]);
        }

        let mut m = Vec::new();
        for i in &self.values {
            m.extend_from_slice(&i.to_le_bytes());
        }
        data.append(&mut m);

        // the first two bytes are the data length, excluding checksum which we'll add next
        let data_length = data.len() as u16;
        data[0..2].copy_from_slice(&data_length.to_le_bytes());

        // checksum does not include the first two bytes (data length)
        data.extend_from_slice(&Self::checksum(&data[2..]));
        */

// Helper function to create a translated data packet
function createWriteRegisterPacketNew(register, value) {
  const packet = Buffer.alloc(19);
  packet.writeUInt16LE(18, 0); // length, excluding checksum
  packet.writeUInt8(0, 2); // Address (0 for writing, 1 for reading)
  packet.writeUInt8(DeviceFunction.WriteSingle, 3); // Device Function
  packet.write(INVERTER_SERIAL_NUMBER, 4, 10, 'ascii'); // Inverter Serial Number
  packet.writeUInt16LE(register, 14);
  packet.writeUInt16LE(value, 16); // Data Length
  packet.writeUInt8(crc(packet.slice(2).values()), 18); // Data Length
  return packet;
}

function createFrame(packet) {
  const frameLength = packet.length + 18 - 6;
  const frame = new Buffer();
  frame.writeUInt16LE(0xa11a, 0); // Prefix
  frame.writeUInt16LE(Protocol.WriteSingle, 2); // Protocol version 2= multi write, 1=single write
  frame.writeUInt16LE(frameLength, 4); // Frame length
  frame.writeUInt8(1, 6); // Address (which inverter)
  frame.writeUInt8(TcpFunction.TranslatedData, 7); // TCP Function
  frame.write(DATALOG_SERIAL_NUMBER, 8, 10, 'ascii'); // Serial Number
  frame.write(packet, 19)
  return frame;
}


// Helper function to parse the response
function parseResponse(data) {
  if (data.length < 18) {
    throw new Error('Invalid packet length');
  }

  // Log the full data buffer for debugging (optional)
  // console.log('Full Data Buffer:', data.toString('hex'));

  // Parse the header
  const prefix = data.readUInt16LE(0); // Prefix (assuming 2 bytes)
  const protocolVersion = data.readUInt16LE(2); // Protocol version (2 bytes, little-endian)
  const packetLength = data.readUInt16LE(4); // Packet length (2 bytes, little-endian)
  const address = data.readUInt8(6); // Address (1 byte)
  const tcpFunction = data.readUInt8(7); // TCP Function (1 byte)
  const serialNumber = data.toString('ascii', 8, 18).trim(); // Serial Number (10 bytes)

  // Determine where the data starts based on header and packet length
  const dataStartIndex = 18; // Data starts after the header
  const expectedDataLength = packetLength - (data.length - dataStartIndex);

  // Log parsed header and data for debugging
  console.log(`Prefix: ${prefix.toString(16)}`);
  console.log(`Protocol Version: ${protocolVersion}`);
  console.log(`Packet Length: ${packetLength}`);
  console.log(`Address: ${address}`);
  console.log(`TCP Function: ${tcpFunction}`);
  console.log(`Serial Number: ${serialNumber}`);

  // Parse specific TCP functions
  switch (tcpFunction) {
    case 0xc1:
      console.log('Heartbeat received');
      break;
    case 0xc2:
      console.log('Data received');
      parseTranslatedData(data.slice(18));
      break;
      // Add more cases as needed for other TCP functions
    default:
      console.warn('Unknown TCP function:', tcpFunction.toString(16));
  }
}

// Helper function to parse translated data
var registers = [];

function parseTranslatedData(data) {
  console.log('parseTranslatedData Buffer:', data.toString('hex'));

  // Extract fields based on the structure provided
  const address = data.readUInt8(2);
  const functionCode = data.readUInt8(3);
  const serialNumber = data.toString('ascii', 4, 14);
  const startAddressALow = data.readUInt8(14);
  const startAddressAHigh = data.readUInt8(15);
  const startAddressA = (startAddressAHigh << 8) | startAddressALow; // Little-endian
  const numberOfBytes = data.readUInt8(16);

  console.log('Address:', address);
  console.log('Function Code:', functionCode);
  console.log('Serial Number:', serialNumber);
  console.log('Start Address A Low:', startAddressALow);
  console.log('Start Address A High:', startAddressAHigh);
  console.log('Start Address A:', startAddressA);
  console.log('Number of Bytes:', numberOfBytes);

  if (startAddressA === 0) {
    registers = []; // Clear array
  }

  // Assuming registers data start at byte 17 onwards

  switch (functionCode) {
    case 0x03: // Read Holding
      console.log('Read Holding data:', data);
      break;
    case 0x04: // Read Input
      console.log('Read Input data:');
      let registerIndex = startAddressA;
      for (let i = 17; i < 17 + numberOfBytes; i += 2) {
        const registerValue = data.readUInt16LE(i);
        const info = getRegisterInfo(registerIndex); // You should define this function
        if (info.description !== "Unknown") {
          console.log(`Register ${registerIndex}: ${info.description} = ${(registerValue / info.divider).toFixed(2)} ${info.unit}`);

          registers.push({
            address: registerIndex,
            description: info.description,
            value: registerValue / info.divider,
            unit: info.unit
          });
        }

        registerIndex++;
      }

      break;
  }

  // Extract and display the data based on the device function
  // switch (functionCode) {
  //   case 0x03: // Read Holding
  //     console.log('Read Holding data:', dataBuffer);
  //     break;
  //   case 0x04: // Read Input
  //     console.log('Read Input data:');
  //     break;
  //   case 0x06: // Write Single Holding
  //     console.log('Write Single Holding response');
  //     break;
  //   case 0x10: // Write Multi Holding
  //     console.log('Write Multi Holding response');
  //     break;
  //   default:
  //     console.warn('Unknown Device Function:', deviceFunction.toString(16));
  // }
  console.log("============================================================");
}




// Create a TCP client
const client = new net.Socket();

// Connect to the inverter
client.connect(PORT, HOST, () => {
  console.log('Connected to the inverter');
});

// Handle incoming data from the inverter
client.on('data', (data) => {
  //console.log('Received data:', data);
  try {
    parseResponse(data);
  } catch (err) {
    console.error('Error parsing response:', err);
  }
});

// Handle connection close
client.on('close', () => {
  console.log('Connection closed');
});

// Handle errors
client.on('error', (err) => {
  console.error('Error:', err);
});

const packet = createWriteRegisterPacket(DATALOG_SERIAL_NUMBER, )

function interpretRegister0(value) {
  switch (value) {
    case 0x00:
      return 'idle / standby';
    case 0x01:
      return 'fault';
    case 0x02:
      return 'programming';
    case 0x04:
      return 'pv supporting load first; surplus into grid';
    case 0x08:
      return 'pv charging battery';
    case 0x10:
      return 'discharge battery to support load; surplus into grid';
    case 0x14:
      return 'pv + battery discharging to support load; surplus into grid';
    case 0x20:
      return 'ac charging battery';
    case 0x28:
      return 'pv + ac charging battery';
    case 0x40:
      return 'battery powering EPS (grid off)';
    case 0x80:
      return 'pv not sufficient to power EPS (grid off)';
    case 0xc0:
      return 'pv + battery powering EPS (grid off)';
    case 0x88:
      return 'pv powering EPS (grid off); surplus stored in battery';
    default:
      return 'unknown status';
  }
}

function getRegisterInfo(address) {
  const registerInfo = {
    0: {
      description: "Operating Mode",
      unit: "N/A",
      divider: 1
    },
    1: {
      description: "PV1 Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    2: {
      description: "PV2 Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    3: {
      description: "PV3 Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    4: {
      description: "Battery Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    5: {
      description: "Battery SOC",
      unit: "%",
      divider: 1
    }, // Original value divided by 10
    6: {
      description: "unknown/reserved",
      unit: "-",
      divider: 1
    }, // Original value divided by 10
    7: {
      description: "PV1 Power",
      unit: "W",
      divider: 1
    }, // Original value divided by 10
    8: {
      description: "PV2 Power",
      unit: "W",
      divider: 1
    }, // Original value divided by 10
    9: {
      description: "PV3 Power",
      unit: "W",
      divider: 1
    }, // Original value divided by 10
    10: {
      description: "Battery Charge Power",
      unit: "W",
      divider: 1
    }, // Original value divided by 10
    11: {
      description: "Battery Discharge Power",
      unit: "W",
      divider: 1
    }, // Original value divided by 10
    12: {
      description: "R-Phase Mains Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    13: {
      description: "S-Phase Mains Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    14: {
      description: "T-Phase Mains Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    15: {
      description: "Mains Frequency",
      unit: "Hz",
      divider: 100
    }, // Original value divided by 10
    16: {
      description: "Inverter Output Power",
      unit: "W",
      divider: 10
    }, // Original value divided by 10
    17: {
      description: "AC Charging Rectified Power",
      unit: "W",
      divider: 10
    }, // Original value divided by 10
    18: {
      description: "Inductor current RMS",
      unit: "A",
      divider: 100
    }, // Original value divided by 10
    19: {
      description: "Grid  Power Factor",
      unit: "N/A",
      divider: 1000
    }, // Original value divided by 1000
    20: {
      description: "R-Phase EPS Output Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    21: {
      description: "S-Phase EPS Output Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    22: {
      description: "T-Phase EPS Output Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    23: {
      description: "EPS Output Frequency",
      unit: "Hz",
      divider: 100
    }, // Original value divided by 10
    24: {
      description: "EPS Inverter Power",
      unit: "W",
      divider: 10
    }, // Original value divided by 10
    25: {
      description: "EPS Apparent Power",
      unit: "W",
      divider: 10
    }, // Original value divided by 10
    26: {
      description: "Export Power to Grid",
      unit: "W",
      divider: 10
    }, // Original value divided by 10
    27: {
      description: "Import Power from Grid",
      unit: "W",
      divider: 10
    }, // Original value divided by 10
    28: {
      description: "PV1 Power Generation Today",
      unit: "W",
      divider: 10
    }, // Original value divided by 10
    29: {
      description: "PV2 Power Generation Today",
      unit: "W",
      divider: 10
    }, // Original value divided by 10
    30: {
      description: "PV3 Power Generation Today",
      unit: "W",
      divider: 10
    }, // Original value divided by 10
    31: {
      description: "Today's Inverter Output Energy",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    32: {
      description: "Today's AC Charging Energy",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    33: {
      description: "Charged Energy Today",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    34: {
      description: "Discharged Energy Today",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    35: {
      description: "EPS Output Energy Today",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    36: {
      description: "Today's Export Energy to Grid",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    37: {
      description: "Today's Import Energy from Grid",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    38: {
      description: "Bus 1 Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    39: {
      description: "Bus 2 Voltage",
      unit: "V",
      divider: 10
    }, // Original value divided by 10
    40: {
      description: "PV1 Cumulative Power Generation (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    41: {
      description: "PV1 Cumulative Power Generation (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    42: {
      description: "PV2 Cumulative Power Generation (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    43: {
      description: "PV2 Cumulative Power Generation (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    44: {
      description: "PV3 Cumulative Power Generation (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    45: {
      description: "PV3 Cumulative Power Generation (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    46: {
      description: "Inverter Accumulative Output Energy (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    47: {
      description: "Inverter Accumulative Output Energy (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    48: {
      description: "AC Charging Accumulative Rectified Energy (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    49: {
      description: "AC Charging Accumulative Rectified Energy (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    50: {
      description: "Cumulative Charge Energy Level (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    51: {
      description: "Cumulative Charge Energy Level (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    52: {
      description: "Cumulative Discharge Energy Level (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    53: {
      description: "Cumulative Discharge Energy Level (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    54: {
      description: "Cumulative Off-Grid Inverter Power (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    55: {
      description: "Cumulative Off-Grid Inverter Power (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    56: {
      description: "Cumulative Export Energy to Grid (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    57: {
      description: "Cumulative Export Energy to Grid (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    58: {
      description: "Cumulative Import Energy from Grid (Low Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    59: {
      description: "Cumulative Import Energy from Grid (High Word)",
      unit: "Wh",
      divider: 1
    }, // No divider needed
    60: {
      description: "Fault Code (Low Word)",
      unit: "integer",
      divider: 1
    }, // No divider needed
    61: {
      description: "Fault Code (High Word)",
      unit: "integer",
      divider: 1
    }, // No divider needed
    62: {
      description: "Warning Code (Low Word)",
      unit: "integer",
      divider: 1
    }, // No divider needed
    63: {
      description: "Warning Code (High Word)",
      unit: "integer",
      divider: 1
    }, // No divider needed
    64: {
      description: "Internal Temperature",
      unit: "°C",
      divider: 10
    }, // Original value divided by 10
    65: {
      description: "Radiator Temperature 1",
      unit: "°C",
      divider: 10
    }, // Original value divided by 10
    66: {
      description: "Radiator Temperature 2",
      unit: "°C",
      divider: 10
    }, // Original value divided by 10
    67: {
      description: "Battery Temperature",
      unit: "°C",
      divider: 10
    }, // Original value divided by 10
    68: {
      description: "unknown/reserved",
      unit: "-",
      divider: 1
    }, // Original value divided by 10
    69: {
      description: "Runtime (Low Word)",
      unit: "seconds",
      divider: 1
    }, // No divider needed
    70: {
      description: "Runtime (High Word)",
      unit: "seconds",
      divider: 1
    },
    //======================
    127: {
      description: "Voltage of EPS L1N",
      unit: "V",
      divider: 10
    },
    128: {
      description: "Voltage of EPS L2N",
      unit: "V",
      divider: 10
    },
    129: {
      description: "Active power of EPS L1N",
      unit: "W",
      divider: 1
    },
    130: {
      description: "Active power of EPS L2N",
      unit: "W",
      divider: 1
    },
    131: {
      description: "Apparent power of EPS L1N",
      unit: "W",
      divider: 1
    },
    132: {
      description: "Apparent power of EPS L2N",
      unit: "W",
      divider: 1
    }
  };

  return registerInfo[address] || {
    description: "Unknown",
    unit: "N/A",
    divider: 1
  };
};

function crc(data) {
   const generator = 0x07;
   const finalCRC = data.reduce((crc, byte) => {
      crc = crc ^ byte;
      for (let i = 0; i < 8; i++) {
         if ((crc & 0x80) !== 0) crc = ((crc << 1) & 0xff) ^ generator;
         else crc = (crc << 1) & 0xff;
      }
      return crc;
   }, 0x00);

   return finalCRC;
}