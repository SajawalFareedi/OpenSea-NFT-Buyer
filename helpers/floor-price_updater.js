const Axios = require("axios").default;
const { SheetData } = require("../database/models/models");
const fs = require("fs");
const { join } = require("path");

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

const filePath = join(__dirname, "../json/secret.json");

const Api = JSON.parse(fs.readFileSync(filePath, "utf8")).api;

const openSeaAxiosInstance = Axios.create({
  baseURL: "https://api.opensea.io/",
  timeout: 1000 * 60 * 5,
  headers: {
    Host: "api.opensea.io",
    "Keep-Alive": true,
    Accept: "application/json",
    "X-API-KEY": Api,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36",
  },
});

/**
 * TODO: Rotate user-agent (url: https://jnrbsn.github.io/user-agents/user-agents.json)
 **/

const updateFloorPrice = () => {
  return new Promise((resolve, reject) => {
    try {
      let timestamp = "";
      let collection_stats;

      SheetData.find(async (error, result) => {
        if (error) throw error;
        if (result.length == 0)
          throw new Error("No Data found in SheetDatas Table");
        for (let i = 0; i < result.length; i++) {
          const row = result[i];

          const slug = row.SLUG;

          collection_stats = await openSeaAxiosInstance
            .get(`https://api.opensea.io/api/v1/collection/${slug}/stats`)
            .catch((e) => {});

          if (typeof collection_stats == "undefined" && typeof collection_stats.data == "undefined" && typeof collection_stats.data.stats == "undefined" && typeof collection_stats.data.stats.floor_price == "undefined") {
            console.info(
              "\nAPI limit reached, floorprice-updater will be resumed after 30 seconds\n"
            );
            await sleep(30);
            collection_stats = await openSeaAxiosInstance
              .get(`https://api.opensea.io/api/v1/collection/${slug}/stats`)
              .catch((e) => {});
          }

          const floorPrice = String(collection_stats.data.stats.floor_price);
          timestamp = String(new Date(Date.now()).toISOString());

          SheetData.updateOne(
            { SLUG: slug },
            { FLOORPRICE: floorPrice, TIMESTAMP: timestamp },
            null,
            async (e) => {
              if (e) throw e;
              console.info(`Updated floorprice:  ${slug} -- ${floorPrice}`);
            }
          );

          await sleep(7);
        }
        console.info(`All Floor Prices are updated -- ${timestamp}\n\n`);
        return resolve("Success");
      });
    } catch (e) {
      console.log(e);
    }
  });
};

console.info("FloorPrice Updater is running...");

updateFloorPrice();

setInterval(updateFloorPrice, 1000 * 60 * 12);
