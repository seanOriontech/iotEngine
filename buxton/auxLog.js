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
  client.subscribe('aux_data/#', (err) => {
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
      
      // Clean up the message to remove line breaks
      let cleanMessage = message.toString().replace(/[\r\n]+/g, "");
      const dateTime = new Date(); // Current timestamp
      const auxDataID = '60178d13-11a9-406d-a60f-c905a3f7b59c'; // Static GUID for AuxDataID
  
      // Build the query to insert or update the record
      const mergeQuery = `
        MERGE INTO [dbo].[Tbl_AuxData] AS Target
        USING (SELECT @AuxDataID AS AuxDataID, @Timestamp AS Timestamp, @Data AS Data) AS Source
        ON Target.AuxDataID = Source.AuxDataID
        WHEN MATCHED THEN
            UPDATE SET Target.Timestamp = Source.Timestamp, Target.Data = Source.Data
        WHEN NOT MATCHED THEN
            INSERT ([AuxDataID], [Timestamp], [Data])
            VALUES (Source.AuxDataID, Source.Timestamp, Source.Data);
      `;

      const pool = await poolPromise;
  
      // Execute the merge query
      await pool.request()
        .input('AuxDataID', sql.UniqueIdentifier, auxDataID)
        .input('Timestamp', sql.DateTime, dateTime)
        .input('Data', sql.NVarChar, cleanMessage)
        .query(mergeQuery);
  
   
  
      // Update instrument daily for all keys in the message
      const data = JSON.parse(cleanMessage);
  
      for (const [key, value] of Object.entries(data)) {
        if (key !== "time") {
          await pool.request()
            .input('name', sql.NVarChar, key)
            .input('timestamp', sql.DateTime, dateTime)
            .input('value', sql.Float, value.Value)
            .execute('UpdateInstrumentDaily'); // Call the stored procedure
        }
      }
  
      console.log('Instrument update successful.');
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

client.on('error', (err) => {
  console.error('MQTT client error:', err);
});
