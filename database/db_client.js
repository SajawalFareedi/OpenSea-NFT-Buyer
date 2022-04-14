const Mongoose = require("mongoose");
const fs = require("fs");
const { join } = require("path");

const secretJSONPath = join(__dirname, "../json/secret.json");

const Secret = JSON.parse(fs.readFileSync(secretJSONPath, "utf8"));

const mongoOptions = {
  keepAlive: true,
  maxPoolSize: 10000,
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
  waitQueueTimeoutMS: 60000,
};

const connect = async () => {
  try {
    await Mongoose.connect(Secret.mongoURI, mongoOptions);
  } catch (error) {}
};

connect();

Mongoose.connection.on("connected", () => {
  console.log("Connected to database...");
});

Mongoose.connection.on("disconnected", () => {
  console.log("Database disconnected, reconnecting...");
  connect();
});

Mongoose.connection.on("reconnected", () => {
  console.log("Reconnected to database...");
});

Mongoose.connection.on("error", (e) => {
  console.log("Error in Mongodb Connection. Trying to reconnect...", e);
  connect();
});

module.exports = Mongoose;
