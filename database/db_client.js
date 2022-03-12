const Mongoose = require("mongoose");
const fs = require("fs");
const { join } = require("path");

const secretJSONPath = join(__dirname, '../json/secret.json')

const Secret = JSON.parse(fs.readFileSync(secretJSONPath, "utf8"));

(async () => {
  await Mongoose.connect(Secret.mongoURI).then(() => {
    console.log("Connected to database...");
  })
    .catch((e) => {
      throw e;
    });
})();

module.exports = Mongoose;
