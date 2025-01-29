const mqtt = require("mqtt");
const redis = require("redis");

// MQTT broker connection options
const mqttOptions = {
  host: "localhost",
  port: 1883,
};

// Redis client configuration
const redisClient = redis.createClient({
  url: "redis://localhost:6379", // Ensure the Redis connection URL is correct
});

// Async function to connect to Redis
(async () => {
  try {
    await redisClient.connect(); // Explicitly connect to Redis
    console.log("Connected to Redis");
  } catch (err) {
    console.error("Redis connection error:", err);
  }
})();

// Connect to MQTT broker
const client = mqtt.connect(mqttOptions);

client.on("connect", () => {
  console.log("Connected to MQTT broker");
  client.subscribe("carloEM112/#", (err) => {
    if (err) {
      console.error("Subscription error:", err);
    } else {
      console.log("Subscribed to topic: carloEM112");
    }
  });
});

client.on("message", async (topic, message) => {
  console.log(`Message received on topic ${topic}: ${message.toString()}`);
  try {
    const data = JSON.parse(message.toString());

    const properties = [
      "Volt",
      "Curr",
      "Pwr",
      "AppPwr",
      "ReactPwr",
      "PwrDmnd",
      "PeakPwrDmnd",
      "PwrFactor",
      "Freq",
      "PwrConsTotal",
      "ReactPwrConsTotal",
    ];

    const deviceId = data.Serial;
    const timestamp = Date.now() / 1000; // Use Unix timestamp in seconds (make sure this is a number)

    for (const field of properties) {
      const value = data[field] ;

      if (value !== undefined) {
        const redisKey = `${deviceId}:${field}`; // Key for each field

        // Ensure the value is a string, and the score (timestamp) is a number
        try {
          await redisClient.zAdd(redisKey, {
            score: timestamp,
            value: `${value.toString()}-${timestamp}`,
          });

          console.log(
            `Inserted ${field}: ${value} into Redis with key: ${redisKey} at timestamp: ${timestamp}`
          );
        } catch (err) {
          console.error("Error inserting data into Redis:", err);
        }
      }
    }
  } catch (error) {
    console.error("Error processing message:", error);
  }
});

client.on("error", (err) => {
  console.error("MQTT client error:", err);
});
