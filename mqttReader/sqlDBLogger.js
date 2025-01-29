const mqtt = require('mqtt');
const sql = require('mssql');
require('dotenv').config();
const amqp = require('amqplib'); // RabbitMQ package

// MQTT broker connection options


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

const rabbitMQUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
const queueNames = ['carloEM24', 'carloEM112','bio']; // Two queues to connect to

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




  async function connectToRabbitMQ() {
    try {
      const connection = await amqp.connect(rabbitMQUrl);
      const channel = await connection.createChannel();
  
      for (const queueName of queueNames) {
        // Assert each queue exists (idempotent operation)
        await channel.assertQueue(queueName, { durable: true });
  
        console.log(`Connected to RabbitMQ, waiting for messages in queue: ${queueName}`);
  
        // Consume messages from the queue
        channel.consume(
          queueName,
          async (msg) => {
            if (msg !== null) {
              const messageContent = msg.content.toString();
           //   console.log(`Message received from queue "${queueName}": ${messageContent}`);
  
              try {
                const parsedMessage = JSON.parse(messageContent);
                await writeToSQL(parsedMessage, queueName); // Write message to SQL
                channel.ack(msg); // Acknowledge the message
              } catch (err) {
                console.error(`Error processing message from queue "${queueName}":`, err);
                channel.nack(msg); // Nack the message if there is an error
              }
            }
          },
          { noAck: false } // Ensure manual acknowledgment
        );
      }
    } catch (err) {
      console.error('RabbitMQ Connection Failed:', err);
      process.exit(1);
    }
  }


  async function writeToSQL(payload, queueName) {
    try {
      const pool = await poolPromise; // Get the SQL connection pool
  
      const timeStamp = new Date(payload.timeStamp); // Get the current timestamp
      const serialNumber = payload.Serial || payload.serial || null; // Extract Serial from payload
      const mac =  payload.Mac ||  payload.MAC || payload.mac || null; // Extract MAC from payload
  
      // Iterate through all properties in the payload
      for (const [key, value] of Object.entries(payload)) {
        // Skip keys that are not part of the telemetry fields
        if (key !== 'Serial' && key !== 'mac' && key !== 'Mac' && key !== 'serial' && key !== 'timeStamp'  && key !== 'MAC' ) {
          try {
            // Execute the stored procedure for each field
            await pool.request()
              .input('TimeStamp', sql.DateTimeOffset, timeStamp)
              .input('Value', sql.Float, value)
              .input('SerialNumber', sql.VarChar(100), serialNumber)
              .input('MAC', sql.VarChar(100), mac)
              .input('Field', sql.VarChar(100), key)
              .execute('UpdateDailyAndMonthlyAverages'); // Replace with your stored procedure name


              await pool.request()
              .input('Device_Id', sql.VarChar(50), mac) // Pass the device ID (SerialNumber in this case)
              .input('LastSeen', sql.DateTime, timeStamp) // Pass the timestamp as LastSeen
              .input('Payload', sql.VarChar(sql.MAX), JSON.stringify(payload)) // Pass the field name and value as JSON
              .execute('UpdateLatestInstrumentData'); // 

          } catch (err) {
            console.error(`Error executing stored procedure for field "${key}":`, err);
          }


        }

   

        if (key == 'total_kWh_Pos' || key =='PwrConsTotal') {

          powerKey = 'Pwr';

          if(key =='total_kWh_Pos' )
          {
            powerKey = 'powerSum';
          }


          try {
            // Execute the stored procedure for each field
          var val =  await pool.request()              
                .input('SerialNumber', sql.VarChar(100), serialNumber) // Pass serial number
                .input('MAC', sql.VarChar(100), mac) // Pass MAC address
                .input('Kwh', sql.Float, payload[key]) // Pass the field name
                .input('KW', sql.Float, payload[powerKey]) // Pass the field name
                .execute('UpdateHourlyPwrRecord'); // Call the stored procedure

                console.error("done", val);

        } catch (err) {
            console.error(`Error executing stored procedure for field "${key}":`, err);
        }

        





        }
      }
  
      console.log(`Successfully processed payload for Serial: ${serialNumber}`);
    } catch (err) {
      console.error('Error processing payload:', err);
    }
  }

connectToRabbitMQ();


