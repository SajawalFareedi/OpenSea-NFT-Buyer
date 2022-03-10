const fs = require("fs"); // For Handling File System
const { NewListings, SheetData } = require("../database/models/models");
const WalletProvider = require("@truffle/hdwallet-provider");
const OpenSeaAPI = require("opensea-js");
const { OrderSide } = require("opensea-js/lib/types");

let loaded_data = {};

const Secrets = JSON.parse(fs.readFileSync("./json/secret.json", "utf-8"));

const Network =
  Secrets.network == "Rinkeby"
    ? OpenSeaAPI.Network.Rinkeby
    : OpenSeaAPI.Network.Main;

const provider = new WalletProvider({
  mnemonic: Secrets.mnemonic,
  providerOrUrl: Secrets.provider,
  from: Secrets.wallet,
  addressIndex: 0,
});

const seaport = new OpenSeaAPI.OpenSeaPort(provider, {
  networkName: Network,
  apiKey: Secrets.api,
});

// Handling the shutdown of node process
process.on("exit", (code) => {
  console.info(`Exiting with code: ${code}`);
});

const buyNFT = async (nft_data) => {
  try {
    const order = await seaport.api.getOrder({
      side: OrderSide.Sell,
      asset_contract_address: nft_data.contract,
      token_id: nft_data.id,
    });

    const fetchedPrice = parseFloat(order.currentPrice) / (10 ** 18);

    if (fetchedPrice == Number(nft_data.price)) {
      const transactionHash = await seaport.fulfillOrder({
        order,
        accountAddress: Secrets.wallet,
      });

      console.info(
        `\nBought a new NFT! Here's the tx: https://etherscan.io/tx/${transactionHash}/\n`
      );
    } else {
      console.info(`
        \nDidn't bought this NFT: https://opensea.io/assets/${nft_data.contract}/${nft_data.id}\n
        Because the price got updated and didn't matched\n
        Old Price - ${Number(nft_data.price)} | New Price - ${fetchedPrice}\n
      `)
    }

  } catch (e) {
    console.error(e);
  }
};

const compareFloorPrice = async () => {
  for (let i = 0; i < loaded_data.SLUGS.length; i++) {
    const slug = loaded_data.SLUGS[i];
    const price = Number(loaded_data.PRICES[i]);
    const contract = loaded_data.LINKS[i].split("/")[4];
    const id = loaded_data.IDs[i];
    const rule = loaded_data.RULES[i];
    const value = loaded_data.VALUES[i];
    const minProfit = loaded_data.MINPROFIT[i];

    const idx = loaded_data.SHEET_SLUGS.indexOf(slug);
    const floor_price = Number(loaded_data.FLOORPRICES[idx]);
    const royalty = Number(loaded_data.ROYALITIES[idx]);

    if (rule == "BelowFloor") {
      const minPrice = ((100 - Number(value.split("%")[0])) / 100) * floor_price;
      const netProfit = (floor_price - ((royalty / 100) * floor_price)) - price;

      if (price <= minPrice && netProfit >= minProfit) {
        await buyNFT({ contract: contract, id: id, price: price });
      }

    } else if (rule == "AboveFloor") {
      const maxPrice = (((100 - Number(value.split("%")[0])) / 100) * floor_price) + floor_price;

      if (price <= maxPrice) {
        await buyNFT({ contract: contract, id: id, price: price });
      }

    } else if (rule == "Fixed") {
      if (price <= Number(value)) {
        await buyNFT({ contract: contract, id: id, price: price });
      }
    }
  }
};

// Function for loading the data from the given excel file
const loadData = () => {
  return new Promise((resolve, reject) => {
    try {
      // SCRAPED DATA
      let SLUGS = [];
      let IDs = [];
      let PRICES = [];
      let LINKS = [];
      let RANKS = [];
      let TRAITS = [];
      let RULES = [];
      let VALUES = [];
      let MINPROFIT = [];

      // GOOGLE SHEET DATA
      let SHEET_SLUGS = [];
      let FLOORPRICES = [];
      let COLLECTIONS = [];
      let TIMESTAMP = [];
      let ROYALITIES = [];

      NewListings.find((error, result) => {
        if (error) throw error;
        if (result.length == 0) return false;

        for (let n = 0; n < result.length; n++) {
          var row = result[n];
          SLUGS.push(row.SLUG);
          IDs.push(row.ID);
          PRICES.push(row.PRICE);
          LINKS.push(row.LINK);
          RANKS.push(row.RANK);
          VALUES.push(row.VALUE);
          TRAITS.push(row.TRAIT);
          MINPROFIT.push(row.MINPROFIT);
          RULES.push(row.RULE);
        }

        SheetData.find((error, result) => {
          if (error) throw error;
          if (result.length == 0)
            throw new Error("No floor-price data is present in the database");

          for (let n = 0; n < result.length; n++) {
            var row = result[n];
            SHEET_SLUGS.push(row.SLUG);
            FLOORPRICES.push(row.FLOORPRICE);
            COLLECTIONS.push(row.COLLECTION);
            TIMESTAMP.push(row.TIMESTAMP);
            ROYALITIES.push(row.ROYALTY);
          }

          return resolve({
            SLUGS: SLUGS,
            IDs: IDs,
            PRICES: PRICES,
            LINKS: LINKS,
            RANKS: RANKS,
            VALUES: VALUES,
            TRAITS: TRAITS,
            MINPROFIT: MINPROFIT,
            RULES: RULES,
            SHEET_SLUGS: SHEET_SLUGS,
            FLOORPRICES: FLOORPRICES,
            COLLECTIONS: COLLECTIONS,
            TIMESTAMP: TIMESTAMP,
            ROYALITIES: ROYALITIES,
          });
        });

      });


    } catch (e) {
      return reject(e);
    }
  });
};

setInterval(async () => {
  try {
    await loadData()
      .then(async (data) => {
        if (data !== false) {
          loaded_data = data;
          await compareFloorPrice();
        }
      })
      .catch((e) => {
        throw e;
      });
  } catch (error) {
    throw error;
  }
}, 1000 * 10); // 10 sec delay

