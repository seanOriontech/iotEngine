const mqtt = require('mqtt');
const sql = require('mssql');
const nodemailer = require('nodemailer');
require('dotenv').config();
const amqp = require('amqplib'); // RabbitMQ package

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
  const queueNames = ['alerts']; // Two queues to connect to

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

              console.log(`Message received from queue "${queueName}": ${messageContent}`);
           
  
              try {
                const parsedMessage = JSON.parse(messageContent);

                const email = await  getEmail(parsedMessage);
                await sendMail(parsedMessage,email);
                
               // await writeToSQL(parsedMessage, queueName); // Write message to SQL
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


  async function getEmail(data)
  {

    try {
        // Connect to the SQL Server
        const pool = await sql.connect(sqlConfig);
        console.log('Connected to SQL Server.');
    
        // Query to get EmailAddress based on AccountID and UserAccountType
        const query = `
          SELECT U.EmailAddress
          FROM Tbl_Account A
          JOIN Tbl_User U ON A.UserID = U.UserID
          WHERE A.AccountID = @AccountID AND A.UserAccountType = 0
        `;
    
        // Execute the query
        const result = await pool.request()
          .input('AccountID', sql.UniqueIdentifier,data.accountID) // Bind AccountID parameter
          .query(query);
    
        if (result.recordset.length > 0) {
          console.log('Email Address:', result.recordset[0].EmailAddress);
          return result.recordset[0].EmailAddress;
        } else {
          console.log('No matching record found.');
          return null;
        }
      } catch (err) {
        console.error('Error querying database:', err);
        throw err;
      } finally {
        // Close the connection
        sql.close();
      }



  }

  async function sendMail(data, to)
  {
var getlastSeen = adjustAndFormatDate( data.lastSeen, data.timeZone);


    const processedMessage = data.message
    .replace(/{name}/g, data.friendlyName)
    .replace(/{lastSeen}/g, getlastSeen);

  // Create the transporter using SMTP
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // Email options
  const mailOptions = {
    from: `"Device Monitoring" <${process.env.SMTP_USER}>`,
    to: to,
    subject: "Device offline - " + data.friendlyName,
    text: processedMessage,
    html: `<p>${processedMessage}</p>`, // Optional: HTML version of the message
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
  } catch (error) {
    console.error(`Error sending email: ${error.message}`);
    throw error;
  }



  }

  function adjustAndFormatDate(lastSeen, timeZoneOffsetMinutes) {
    // Convert lastSeen to a Date object
    const lastSeenDate = new Date(lastSeen);
    
  
    // Add the timezone offset (in minutes) to the Date
    const adjustedDate = new Date(lastSeenDate.getTime() + timeZoneOffsetMinutes * 60000);


  
    // Format the date to 'YYYY-DD-HH HH:mm:ss'
    const year = adjustedDate.getUTCFullYear();
    const day = String(adjustedDate.getUTCDate()).padStart(2, '0');
    const month = String(adjustedDate.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const hours = String(adjustedDate.getUTCHours()).padStart(2, '0');
    const minutes = String(adjustedDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(adjustedDate.getUTCSeconds()).padStart(2, '0');
  
    return `${year}-${day}-${month} ${hours}:${minutes}:${seconds}`;
  }
  

  
connectToRabbitMQ();
