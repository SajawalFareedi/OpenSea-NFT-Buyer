const Mongoose = require("mongoose");
const fs = require("fs");

const Secret = JSON.parse(fs.readFileSync("../json/secret.json", "utf8"));

(async () => {
  await Mongoose.connect(Secret.mongoURI).then(() => {
    console.log("Connected to database...");
  })
    .catch((e) => {
      throw e;
    });
})();

module.exports = Mongoose;
