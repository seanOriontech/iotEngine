const redis = require("redis");
const cron = require("node-cron");

// Redis client configuration
const redisClient = redis.createClient({
    url: "redis://localhost:6379"//with your actual Redis credentials
});

// Async function to connect to Redis
(async () => {
  try {
    await redisClient.connect();
    console.log("Connected to Redis");

    // Run cleanup on startup
    await cleanOldData();
  } catch (err) {
    console.error("Redis connection error:", err);
  }
})();

// Cleanup function to remove data older than 7 days
async function cleanOldData() {
  const oneWeekAgo = Math.floor(Date.now() / 1000) - (2 * 24 * 60 * 60); // Unix timestamp for one week ago
  const keys = await redisClient.keys("*"); // Use a specific pattern if your keys follow a naming convention

  for (const key of keys) {
    const type = await redisClient.type(key);
    if (type === "zset") {
      try {
        await redisClient.zRemRangeByScore(key, "-inf", oneWeekAgo);
        console.log(`Cleaned old data from ${key}`);
      } catch (err) {
        console.error(`Error cleaning data from ${key}:`, err);
      }
    }
  }
}

// Schedule the cleanup function to run daily at midnight
cron.schedule("0 0 * * *", () => {
  console.log("Starting daily Redis cleanup task");
  cleanOldData();
});