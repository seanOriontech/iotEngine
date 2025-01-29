const mqtt = require('mqtt');
const sql = require('mssql');
require('dotenv').config();

// MQTT broker connection options
const mqttOptions = {
  host: 'localhost',
  port: 1883,

};

// SQL Server connection configuration
const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
};

// Connect to SQL Server
const poolPromise = sql.connect(sqlConfig)
  .then((pool) => {
    console.log('Connected to SQL Server');
    return pool;
  })
  .catch((err) => {
    console.error('Database Connection Failed!', err);
    process.exit(1);
  });

// Connect to MQTT broker
const client = mqtt.connect(mqttOptions);

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe('water_data/#', (err) => {
    if (err) {
      console.error('Subscription error:', err);
    } else {
      console.log('Subscribed to topic: water_data');
    }
  });
});

client.on('message', async (topic, message) => {
 
  try {
    console.log(message.toString());
    let cleanMessage = message.toString().replace(/[\r\n]+/g, ""); // Removes line breaks
    const data = JSON.parse(cleanMessage.toString());
    const dateTime = new Date(); // Current timestamp for each record

    const pool = await poolPromise;

    // Initialize an empty array to hold the bulk insert queries
    let values = [];

    for (const [key, value] of Object.entries(data)) {
        if(key != "time")
        {
      console.log(`Property name: ${key}, Property value: ${value.Value}`);

      // Prepare the values for insertion into the database
      values.push(`('${key}', '${value.Value}', '${dateTime.toISOString()}')`);
        }
    }

    // Join all values for the bulk insert
    const bulkInsertQuery = `
      INSERT INTO [dbo].[Tbl_TelemetryWater] ([name], [value], [Timestamp])
      VALUES ${values.join(",")}
    `;

    // Execute the bulk insert query
    await pool.request().query(bulkInsertQuery);

    for (const [key, value] of Object.entries(data)) {
      if (key != "time") {
          await pool.request()
              .input('name', sql.NVarChar, key)
              .input('timestamp', sql.DateTime, dateTime)
              .input('value', sql.Float, value.Value)
              .execute('UpdateInstrumentDaily'); // Stored procedure call
      }
  }


    console.log('Bulk insert successful.');
  } catch (error) {
    console.error('Error processing message:', error);
  }
});

client.on('error', (err) => {
  console.error('MQTT client error:', err);
});
