const Axios = require("axios").default;
const { SheetData } = require("../database/models/models");
const fs = require("fs");
const { join } = require("path");

function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

const filePath = join(__dirname, "../json/secret.json");

const Api = JSON.parse(fs.readFileSync(filePath, "utf8")).api;

const openSeaAxiosInstance = Axios.create({
    baseURL: "https://api.opensea.io/",
    timeout: (1000 * 60) * 5,
    headers: {
        Host: "api.opensea.io",
        "Keep-Alive": true,
        Accept: "application/json",
        "X-API-KEY": Api,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36",
    },
});

// https://jnrbsn.github.io/user-agents/user-agents.json

const updateFloorPrice = () => {
    return new Promise((resolve, reject) => {
        console.info("FloorPrice Updater is running...")
        try {
            let timestamp = "";

            SheetData.find(async (error, result) => {
                if (error) throw error;
                if (result.length == 0) throw new Error("No Data found in SheetDatas Table");
                for (let i = 0; i < result.length; i++) {
                    const row = result[i];

                    const slug = row.SLUG;

                    const collection_stats = await openSeaAxiosInstance.get(`https://api.opensea.io/api/v1/collection/${slug}/stats`).catch((e) => { });

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
