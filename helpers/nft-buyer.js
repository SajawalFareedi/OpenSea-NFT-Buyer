const fs = require('fs');
const moment = require('moment');
const { NewListings, SheetData } = require('../database/models/models');
const WalletProvider = require('@truffle/hdwallet-provider');
const web3 = require('web3');
const OpenSeaAPI = require('opensea-js');
const { OrderSide } = require('opensea-js/lib/types');

let loaded_data = {};
const Time = [];

const Secrets = JSON.parse(fs.readFileSync('./json/secret.json', 'utf-8'));

const Network =
  Secrets.network == 'Rinkeby' ?
    OpenSeaAPI.Network.Rinkeby :
    OpenSeaAPI.Network.Main;

Secrets.network == 'Rinkeby' ?
  console.info('\n[INFO]: Running on Testnet\n') :
  console.info('\n[INFO]: Running on Mainnet\n');

let seaport;

const updateProvider = () => {
  console.log('Updating Network Provider...');
  try {
    const hdWalletProvider = new WalletProvider({
      mnemonic: Secrets.mnemonic,
      providerOrUrl: Secrets.provider,
      from: Secrets.wallet,
      addressIndex: 0,
    });

    const Web3 = new web3(hdWalletProvider, {
      clientConfig: {
        keepalive: true,
        keepaliveInterval: 60000,
      },
      reconnect: {
        auto: true,
        delay: 1000,
        maxAttempts: 10,
        onTimeout: true,
      },
    });

    const Provider = Web3.currentProvider;

    Secrets.network == 'Rinkeby' ?
      (seaport = new OpenSeaAPI.OpenSeaPort(Provider, {
        networkName: Network,
      })) :
      (seaport = new OpenSeaAPI.OpenSeaPort(Provider, {
        networkName: Network,
        apiKey: Secrets.api,
      }));
  } catch (e) {
    console.log(e);
    updateProvider();
  }
};

process.on('exit', (code) => {
  console.info(`Exiting with code: ${code}`);
});

const changeIsBoughtStatus = (id) => {
  return new Promise((resolve, reject) => {
    try {
      NewListings.updateOne({ ID: id }, { isBought: true }, null, (e) => {
        if (e) throw e;
        return resolve('Success');
      });
    } catch (e) {
      return reject(e);
    }
  });
};

const IsBought = (id, slug) => {
  return new Promise((resolve, reject) => {
    try {
      NewListings.findOne({ ID: id, SLUG: slug }, (e, d) => {
        if (e) throw e;
        return resolve(d.isBought);
      });
    } catch (e) {
      return reject(e);
    }
  });
};

const buyNFT = async (nft_data) => {
  try {
    console.info(`
        \nGoing to buy this NFT: https://opensea.io/assets/${nft_data.contract}/${nft_data.id}\n`);
    const order = await seaport.api
      .getOrder({
        side: OrderSide.Sell,
        asset_contract_address: nft_data.contract,
        token_id: nft_data.id,
      })
      .catch((e) => {
        throw e;
      });

    const fetchedPrice = parseFloat(order.currentPrice) / 10 ** 18;

    if (fetchedPrice == Number(nft_data.price)) {
      await changeIsBoughtStatus(nft_data.id).catch((e) => {
        throw e;
      });
      const transactionHash = await seaport
        .fulfillOrder({
          order,
          accountAddress: Secrets.wallet,
        })
        .catch((e) => {
          throw e;
        });

      console.info(`\nBought a new NFT! Here's the tx: https://etherscan.io/tx/${transactionHash}/\n`);
    } else {
      console.info(`
        \nDidn't bought this NFT: https://opensea.io/assets/${nft_data.contract}/${nft_data.id}\n
        Because the price got updated and didn't matched\n
        Old Price - ${Number(nft_data.price)} | New Price - ${fetchedPrice}\n
      `);
    }
  } catch (e) {
    throw e;
  }
};

const compareFloorPrice = async () => {
  for (let i = 0; i < loaded_data.SLUGS.length; i++) {
    const slug = loaded_data.SLUGS[i];
    const price = Number(loaded_data.PRICES[i]);
    const contract = loaded_data.LINKS[i].split('/')[4];
    const id = loaded_data.IDs[i];
    const BuyerData = loaded_data.BuyerData[i];
    for (let x = 0; x < BuyerData.length; x++) {
      const isBought = await IsBought(id, slug);
      if (isBought == false) {
        const buyerData = BuyerData[x];

        const rule = buyerData.rule;
        const value = buyerData.value;
        const minProfit = buyerData.minProfit;

        const idx = loaded_data.SHEET_SLUGS.indexOf(slug);
        if (idx == -1) {
          throw new Error(`The Given Slug is not present in the SheetDatas Table. Slug: ${slug}`);
        }
        const floor_price = Number(loaded_data.FLOORPRICES[idx]);
        const royalty = Number(loaded_data.ROYALITIES[idx]);
        const timestamp = loaded_data.TIMESTAMP[idx];

        const minutes = moment().diff(moment(timestamp, true), 'minutes');
        if (minutes <= 12) {
          if (rule == 'BelowFloor') {
            const minPrice = ((100 - Number(value)) / 100) * floor_price;
            const netProfit =
              floor_price - (royalty / 100) * floor_price - price;

            if (price <= minPrice && netProfit >= minProfit) {
              await buyNFT({ contract: contract, id: id, price: price });
            }
          } else if (rule == 'AboveFloor') {
            const maxPrice =
              ((100 - Number(value)) / 100) * floor_price + floor_price;

            if (price <= maxPrice) {
              await buyNFT({ contract: contract, id: id, price: price });
            }
          } else if (rule == 'Fixed') {
            if (price <= Number(value)) {
              await buyNFT({ contract: contract, id: id, price: price });
            }
          }
        } else {
          console.log(
            `\nFloorPrice isn't updated for this slug: ${slug}, Last Updated: ${minutes} Minutes ago\n`,
          );
        }
      }
    }
  }
};

const extractNewListings = (data) => {
  return new Promise((resolve, reject) => {
    try {
      const SLUGS = [];
      const IDs = [];
      const PRICES = [];
      const LINKS = [];
      const RANKS = [];
      const BuyerData = [];

      for (let i = 0; i < data.SLUGS.length; i++) {
        const time = Time[i];
        const minutes = moment().diff(moment(time), 'minutes');
        if (minutes <= 5) {
          SLUGS.push(data.SLUGS[i]);
          IDs.push(data.IDs[i]);
          PRICES.push(data.PRICES[i]);
          LINKS.push(data.LINKS[i]);
          RANKS.push(data.RANKS[i]);
          BuyerData.push(data.BuyerData[i]);
        }
      }

      loaded_data = {
        SLUGS: SLUGS,
        IDs: IDs,
        PRICES: PRICES,
        LINKS: LINKS,
        RANKS: RANKS,
        BuyerData: BuyerData,
        SHEET_SLUGS: data.SHEET_SLUGS,
        FLOORPRICES: data.FLOORPRICES,
        COLLECTIONS: data.COLLECTIONS,
        TIMESTAMP: data.TIMESTAMP,
        ROYALITIES: data.ROYALITIES,
      };

      return resolve('Success');
    } catch (e) {
      return reject(e);
    }
  });
};

const loadData = () => {
  return new Promise((resolve, reject) => {
    try {
      // SCRAPED DATA
      const SLUGS = [];
      const IDs = [];
      const PRICES = [];
      const LINKS = [];
      const RANKS = [];
      const BuyerData = [];

      // GOOGLE SHEET DATA
      const SHEET_SLUGS = [];
      const FLOORPRICES = [];
      const COLLECTIONS = [];
      const TIMESTAMP = [];
      const ROYALITIES = [];

      NewListings.find({ isBought: false }, (error, result) => {
        if (error) throw error;
        if (result.length == 0) return false;

        for (let n = 0; n < result.length; n++) {
          const row = result[n];
          SLUGS.push(row.SLUG);
          IDs.push(row.ID);
          PRICES.push(row.PRICE);
          LINKS.push(row.LINK);
          RANKS.push(row.RANK);
          BuyerData.push(row.BuyerData);
          Time.push(row.DATE);
        }

        SheetData.find((error, result) => {
          if (error) throw error;
          if (result.length == 0) {
            throw new Error('No floor-price data is present in the database');
          }

          for (let n = 0; n < result.length; n++) {
            const row = result[n];
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
            BuyerData: BuyerData,
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

// setInterval(async () => {
//   (async () => {
//     try {
//       await loadData()
//         .then(async (data) => {
//           if (data !== false) {
//             await extractNewListings(data)
//               .then(async () => {
//                 await compareFloorPrice();
//               })
//               .catch((e) => {
//                 throw e;
//               });
//           }
//         })
//         .catch((e) => {
//           throw e;
//         });
//     } catch (error) {
//       throw error;
//     }
//   })();
// }, 2000); // 2 sec delay


updateProvider();
setInterval(updateProvider, 60000 * 60);
