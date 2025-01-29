const mqtt = require('mqtt');
const { InfluxDBClient, Point } = require('@influxdata/influxdb3-client');


const token = "oa9chnNdc0ib5e4K1_W-lXOaFHnmXTAzS-anuGJGVYLlWpAG0jHNzBg4NRk1sqUBW7sg_9MRayt9MhvRyD2-zw==";

const client = mqtt.connect('mqtt://localhost');

// Connect to MQTT broker

const clientDB = new InfluxDBClient({host: 'https://eu-central-1-1.aws.cloud2.influxdata.com', token: token})

// Decode data packet function
function decodeDataPacket(buffer) {
  let offset = 0;

  const serial = buffer.toString('ascii', offset, offset + 3);
  offset += 3;

  const mac = [];
  for (let i = 0; i < 6; i++) {
    mac.push(buffer.readUInt8(offset++).toString(16).padStart(2, '0'));
  }
  offset = 12;

  const data = {
    serial,
    mac: mac.join(':'),
    V1N: buffer.readInt32LE(offset), // offset + 0
    V2N: buffer.readInt32LE(offset + 4),
    V3N: buffer.readInt32LE(offset + 8),
  
    V12: buffer.readInt32LE(offset + 12),
    V23: buffer.readInt32LE(offset + 16),
    V31: buffer.readInt32LE(offset + 20),
  
    C1: buffer.readInt32LE(offset + 24),
    C2: buffer.readInt32LE(offset + 28),
    C3: buffer.readInt32LE(offset + 32),
  
    P1: buffer.readInt32LE(offset + 36),
    P2: buffer.readInt32LE(offset + 40),
    P3: buffer.readInt32LE(offset + 44),
  
    S1: buffer.readInt32LE(offset + 48),
    S2: buffer.readInt32LE(offset + 52),
    S3: buffer.readInt32LE(offset + 56),


  

  
   
  };


  return data;
}

function decodeDataPacketTwo(buffer) {

  let offset = 0;
  const data = {


    Q1: buffer.readInt32BE(offset ), // offset + 0
    Q2: buffer.readInt32BE(offset + 4), // offset + 0
    Q3: buffer.readInt32BE(offset + 8),
  
    voltageSum: buffer.readInt32BE(offset + 12),
    lineVoltageSum: buffer.readInt32BE(offset + 16),
    powerSum: buffer.readInt32BE(offset + 20),
  
    apparentPowerSum: buffer.readInt32BE(offset + 24),
    reactivePowerSum: buffer.readInt32BE(offset + 28),
    PD: buffer.readInt32BE(offset + 32),
  
    AD: buffer.readInt32BE(offset + 36),
    PF1: buffer.readInt32BE(offset + 40),
    PF2: buffer.readInt32BE(offset + 44),
  
    PF3: buffer.readInt32BE(offset + 48),
    F: buffer.readInt32BE(offset + 52),

    PPD: buffer.readInt32BE(offset + 56),
    APD: buffer.readInt32BE(offset + 60),
    PCD: buffer.readInt32BE(offset + 64),

 




  
   
  };

  const highPart = buffer.readUInt16BE(69);   // 2 bytes at the start (high part)
const lowPart = buffer.readUInt16BE(72);    // 2 bytes starting at index 2 (low part)

// Combine highPart and lowPart into a single 32-bit raw value
const combinedRawValue = (highPart << 16) | lowPart;

// Calculate corrected energy total with scaling factor (311.0)
const scalingFactor = 311.0;
const total_kWh_Pos = combinedRawValue * scalingFactor;

data.kWh =0;

  console.log(`Decode kwH: ${data.kWh}`);


  return data;
}

async function saveToInflux(json)
{
let database = `powerMeter`


let points = [];
for (const [key, value] of Object.entries(json)) {
  //  console.log(`Property name: ${key}, Property value: ${value}`);

  console.log(json);

    if(key != "serial" && key != "mac")
    {
        points.push( Point.measurement("powerMeter")
        .setTag("serial", json.serial.toString())
        .setTag("mac", json.mac.toString())
        .setIntegerField(key, value));

    }
}

   

 
await clientDB.write(points, database);
}


function publishToTopic(topic, payload) {
  client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) {
   //   console.error('Failed to publish message:', err);
    } else {
    //  console.log(`Message published to topic "${topic}":`, payload);
    }
  });
}
         



// Insert decoded data into SQL Server

// Handle incoming messages on MQTT
client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe('carloEM24/#', (err) => {
    if (err) {
      console.error('Subscription error:', err);
    }
  });


});

decodedFirst = {};
decodedLast = {};
client.on('message', (topic, message) => {


 
  if(topic.includes('data1'))
   {
    decodedFirst = message;

    
   }
   else{
   
   
    const combinedObject = {
      ...decodedFirst,  // Spread the existing properties
      ...decodedLast        // Spread the data properties
    };
    

    saveToInflux(combinedObject);
  //  publishToTopic("carloEM112/"+decodedFirst.serial,combinedObject);



   }
});



client.on('error', (err) => {
  console.error('MQTT client error:', err);
});