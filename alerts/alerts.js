const sql = require("mssql");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const amqp = require("amqplib"); // RabbitMQ library

const rabbitMqUrl = "amqp://localhost"; // Replace with your RabbitMQ URL
const rabbitQueue = "alerts"; // Replace with your desired queue name

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

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(rabbitMqUrl);
    rabbitChannel = await connection.createChannel();
    await rabbitChannel.assertQueue(rabbitQueue);
    console.log("Connected to RabbitMQ");
  } catch (error) {
    console.error("Failed to connect to RabbitMQ:", error);
  }
}

// Call the RabbitMQ connection function
connectRabbitMQ();

// Function to determine online/offline status
async function checkDeviceStatus() {
  try {
    // Connect to SQL Server
    const pool = await sql.connect(sqlConfig);

    console.log("Connected to SQL Server.");

    // Step 1: Query Tbl_AccountInstrument for enabled devices
    const accountInstrumentQuery = `
      SELECT 
        AI.AccountInstrumentsID,
        AI.Message,
        AI.IntervalMins,
        I.MAC,
        AI.Enable,
        AI.AccountID,
        AI.FriendlyName,
        AI.TimeZone
      FROM Tbl_AccountInstrument AI
      JOIN Instruments I ON AI.Instruments_Id = I.Instruments_Id
     
    `;

    const accountInstruments = await pool
      .request()
      .query(accountInstrumentQuery);

    if (accountInstruments.recordset.length === 0) {
      console.log("No enabled devices found.");
      return;
    }

    const now = new Date();

    // Step 2: Check each device's LastSeen time in Tbl_LatestInstrumentData
    for (const instrument of accountInstruments.recordset) {
      const {
        AccountInstrumentsID,
        MAC,
        IntervalMins,
        Enable,
        Message,
        AccountID,
        FriendlyName,
        TimeZone,
      } = instrument;

      console.log(MAC);
      const latestDataQuery = `
        SELECT LastSeen
        FROM Tbl_LatestInstrumentData
        WHERE Device_ID = @MAC
      `;

      const latestData = await pool
        .request()
        .input("MAC", sql.VarChar, MAC)
        .query(latestDataQuery);

      // console.log(latestData);

      let isOnline = false;

      let lastSeenDate = new Date();

      if (latestData.recordset.length > 0) {
        const { LastSeen } = latestData.recordset[0];
        lastSeenDate = new Date(LastSeen);

        // Calculate the time difference in minutes
        const timeDifference = (now - lastSeenDate) / (1000 * 60); // Convert ms to minutes
        isOnline = timeDifference <= IntervalMins;

        // Step 3: Update Tbl_AccountInstrument
        await pool
          .request()
          .input("Offline", sql.Bit, !isOnline) // Set Offline to true if device is offline
          .input(
            "AccountInstrumentsID",
            sql.UniqueIdentifier,
            AccountInstrumentsID
          ).query(`
              UPDATE Tbl_AccountInstrument
              SET Offline = @Offline
              WHERE AccountInstrumentsID = @AccountInstrumentsID
            `);
      }

      if (isOnline) {
        // If online, deactivate alarms
        await pool
          .request()
          .input("ResolvedTime", sql.DateTimeOffset, now)
          .input(
            "AccountInstrumentsID",
            sql.UniqueIdentifier,
            AccountInstrumentsID
          ).query(`
                UPDATE Tbl_PeriodAlarm
                SET IsActive = 0, ResolvedTime = @ResolvedTime
                WHERE AccountInstrumentsID = @AccountInstrumentsID AND IsActive = 1
              `);
      } else {
        // If offline, check if any active alarm exists
        const activeAlarms = await pool
          .request()
          .input(
            "AccountInstrumentsID",
            sql.UniqueIdentifier,
            AccountInstrumentsID
          ).query(`
                SELECT COUNT(*) AS Count
                FROM Tbl_PeriodAlarm
                WHERE AccountInstrumentsID = @AccountInstrumentsID AND IsActive = 1
              `);

        if (activeAlarms.recordset[0].Count === 0) {
          // No active alarms, insert a new alarm

          const periodAlarmID = uuidv4();

          await pool
            .request()
            .input("PeriodAlarmID", sql.UniqueIdentifier, periodAlarmID)
            .input("LastSeen", sql.DateTimeOffset, lastSeenDate)
            .input("AlarmTriggeredTime", sql.DateTimeOffset, now)
            .input("IsActive", sql.Bit, 1)
            .input("ResolvedTime", sql.DateTimeOffset, null)
            .input("Priority", sql.Int, 4)
            .input("NotificationSent", sql.Bit, 0)
            .input(
              "AccountInstrumentsID",
              sql.UniqueIdentifier,
              AccountInstrumentsID
            ).query(`
                  INSERT INTO Tbl_PeriodAlarm
                  ([PeriodAlarmID],[LastSeen], [AlarmTriggeredTime], [IsActive], [ResolvedTime], [Priority], [NotificationSent], [AccountInstrumentsID])
                  VALUES (@PeriodAlarmID,@LastSeen, @AlarmTriggeredTime, @IsActive, @ResolvedTime, @Priority, @NotificationSent, @AccountInstrumentsID)
                `);

          if (Enable) {
            let payload = {
              periodAlarmID: periodAlarmID,
              message: Message,
              accountID: AccountID,
              lastSeen: lastSeenDate,
              friendlyName: FriendlyName,
              timeZone: TimeZone,
            };

            rabbitChannel.sendToQueue(
              rabbitQueue,
              Buffer.from(JSON.stringify(payload))
            );
            console.log(
              `Message published to RabbitMQ queue "${rabbitQueue}":`,
              payload
            );
          }
        }
      }
    }

    // Close the connection
    await pool.close();
  } catch (err) {
    console.error("Error:", err);
  }
}

// Schedule the check every minute
setInterval(checkDeviceStatus, 60 * 1000); // Run every 60 seconds

// Initial run
checkDeviceStatus();
