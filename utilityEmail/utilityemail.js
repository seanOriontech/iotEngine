const Imap = require("imap-simple");
const { simpleParser } = require("mailparser");
const axios = require("axios");
const fs = require("fs");
const amqp = require("amqplib"); // RabbitMQ package

const config = {
  imap: {
    user: "utility@smartmonitoring.co.za", // Replace with your email
    password: "ROA@300ccPassword", // Replace with your email password
    host: "chianina.aserv.email", // Replace with your email provider's IMAP server
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  },
};

const rabbitMQUrl = process.env.RABBITMQ_URL || "amqp://localhost";
const queueNames = ["utility"]; // Two queues to connect to

let rabbitChannel; // Declare a variable for the RabbitMQ channel

// Function to connect to RabbitMQ
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(rabbitMQUrl);
    rabbitChannel = await connection.createChannel();
    await rabbitChannel.assertQueue(queueNames[0]);
    console.log("Connected to RabbitMQ");
  } catch (error) {
    console.error("Failed to connect to RabbitMQ:", error);
  }
}

let index = 0;
async function startEmailMonitor() {
  try {
    const connection = await Imap.connect(config);
    console.log("Connected to email server");

    // Open the INBOX
    await connection.openBox("INBOX");

    // Listen for new emails
    connection.on("mail", async () => {
      console.log("New email detected! Checking inbox...");

      // Search for unread emails
      const searchCriteria = ["UNSEEN"];
      const fetchOptions = { bodies: [""], struct: true };

      const messages = await connection.search(searchCriteria, fetchOptions);

      for (const message of messages) {
        const allParts = Imap.getParts(message.attributes.struct);

        console.log(allParts);

        // Extract only attachments that are PDFs
        const attachments = allParts.filter(
          (part) =>
            part.disposition &&
            part.disposition.type.toUpperCase() === "ATTACHMENT" &&
            part.subtype &&
            part.subtype.toUpperCase() === "PDF"
        );

        if (attachments.length === 0) {
          console.log("No PDF attachments found. Skipping email.");
          continue; // Skip this email if there are no PDF attachments
        }

        // Parse the email
        // const email = await simpleParser(
        //   await connection.getPartData(message, message.parts[0].body)
        //  );

        // console.log(`Processing email from: ${email.from.text}`);

        for (const attachment of attachments) {
          if (!attachment.params || !attachment.params.name) {
            console.log("Skipping an attachment with no name.");
            continue;
          }

          console.log(`Downloading PDF: ${attachment.params.name}`);

          try {
            // Get attachment data safely
            const attachmentData = await connection.getPartData(
              message,
              attachment
            );

            if (!attachmentData || attachmentData.length === 0) {
              console.log(
                `Skipping empty attachment: ${attachment.params.name}`
              );
              continue;
            }

            const filePath = `./${attachment.params.name}`;

            // Save the file temporarily
            fs.writeFileSync(filePath, attachmentData);
            console.log(`Saved PDF: ${filePath}`);

            // Send the file to the endpoint

            rabbitChannel.sendToQueue(queueNames[0], Buffer.from(filePath));

            // Delete the temp file after sending
            // fs.unlinkSync(filePath);

            console.log(`Deleted temp file: ${filePath}`);
          } catch (error) {
            console.error(
              `Error processing attachment ${attachment.params.name}:`,
              error.message
            );
          }
        }
        await connection.addFlags(message.attributes.uid, "\\Seen");
        console.log(`Marked email as read: ${message.attributes.uid}`);
      }
    });

    console.log("Monitoring inbox for new emails...");
  } catch (error) {
    console.error("Error connecting to email server:", error);
  }
}

connectRabbitMQ();

startEmailMonitor();
