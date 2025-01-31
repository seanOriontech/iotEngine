const amqp = require("amqplib"); // RabbitMQ package
const { simpleParser } = require("mailparser");
const axios = require("axios");
const FormData = require("form-data");

const fs = require("fs");
const rabbitMQUrl = process.env.RABBITMQ_URL || "amqp://localhost";
const queueNames = ["utility"]; // Two queues to connect to

const apiEndpoint =
  "http://localhost:5296/api/PowerBillingAccount/utilitiesLinked"; // Update with your actual API URL

async function connectToRabbitMQ() {
  try {
    const connection = await amqp.connect(rabbitMQUrl);
    const channel = await connection.createChannel();

    for (const queueName of queueNames) {
      // Assert each queue exists (idempotent operation)
      await channel.assertQueue(queueName, { durable: true });

      console.log(
        `Connected to RabbitMQ, waiting for messages in queue: ${queueName}`
      );

      // Consume messages from the queue
      channel.consume(
        queueName,
        async (msg) => {
          if (msg !== null) {
            const messageContent = msg.content.toString();
            //   console.log(`Message received from queue "${queueName}": ${messageContent}`);

            try {
              const parsedMessage = messageContent;
              console.log(parsedMessage);
              await uploadFile(messageContent);
              channel.ack(msg); // Acknowledge the message
            } catch (err) {
              console.error(
                `Error processing message from queue "${queueName}":`,
                err
              );
              channel.nack(msg); // Nack the message if there is an error
            }
          }
        },
        { noAck: false } // Ensure manual acknowledgment
      );
    }
  } catch (err) {
    console.error("RabbitMQ Connection Failed:", err);
    process.exit(1);
  }
}

async function uploadFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return;
  }

  const formData = new FormData();
  formData.append("file", fs.createReadStream(filePath));

  console.log(`📤 Uploading file: ${filePath}`);
  console.log("Outgoing Request Headers:", formData.getHeaders());

  try {
    const response = await axios.post(apiEndpoint, formData, {
      headers: {
        ...formData.getHeaders(), // merges Content-Type with boundary
        "Content-Type": "multipart/form-data",
      },
    });

    console.log("✅ File uploaded successfully:", response.data);
  } catch (error) {
    console.error(
      "❌ Error uploading file:",
      error.response?.data || error.message
    );
  }
}

uploadFile("./7336736528_733474461709.pdf");

connectToRabbitMQ();
