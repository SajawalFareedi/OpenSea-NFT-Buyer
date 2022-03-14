const Axios = require("axios").default;
const { SheetData } = require("../database/models/models");
const fs = require("fs");
const { join } = require("path")

function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

const filePath = join(__dirname, "../json/secret.json");

const Api = JSON.parse(fs.readFileSync(filePath, "utf8")).api;

const updateFloorPrice = () => {
    return new Promise((resolve, reject) => {
        console.info("FloorPrice Updater is running...")
        try {
            let timestamp = "";
            const headers = {
                "Accept": "application/json",
                "X-API-KEY": Api
            };

            SheetData.find(async (error, result) => {
                if (error) throw error;
                if (result.length == 0) throw new Error("No Data found in SheetDatas Table");
                for (let i = 0; i < result.length; i++) {
                    const row = result[i];

                    const slug = row.SLUG;

                    const collection_stats = await Axios.get(`https://api.opensea.io/api/v1/collection/${slug}/stats`, { headers: headers });

                    const floorPrice = String(collection_stats.data.stats.floor_price);
                    timestamp = String(new Date(Date.now()).toISOString());

                    SheetData.updateOne({ SLUG: slug }, { FLOORPRICE: floorPrice, TIMESTAMP: timestamp }, null, async (e) => {
                        if (e) throw e;
                        console.info(`Updated floorprice:  ${slug} -- ${floorPrice}`);
                    });

                    await sleep(7);
                };
                console.info(`All Floor Prices are updated -- ${timestamp}\n\n`);
                return resolve("Success");
            });
        } catch (e) {
            return reject(e);
        };
    });
};

updateFloorPrice();

setInterval(updateFloorPrice, 1000 * 60 * 10);
