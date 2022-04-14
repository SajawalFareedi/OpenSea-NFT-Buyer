'use strict';

// This instructs Node to allow untrusted certificates (untrusted = not verified by a certificate authority)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

// Importing required Modules or Packages
const xlsx = require('xlsx'); // For Reading and Writing to XLSX files
const { NewListings, SheetData } = require('./database/models/models'); // New Listings Model for Reading and Writing Listings
const fs = require('fs'); // For Reading and Writing JSON files
const moment = require('moment'); // For Checking if 24 hours have been passed (for a particular item in the JSON file)
const puppeteer = require('puppeteer-extra').default; // Just like selenium in Python, but much better than it 💯
const pluginStealth = require('puppeteer-extra-plugin-stealth');
const { join } = require('path');
// const { performance } = require("perf_hooks");

// Using Stealth Plugin it Applies various techniques to make detection of headless puppeteer (or bot) harder. 💯
puppeteer.use(pluginStealth());

// Handling the exiting of the node process
process.on('exit', (code) => {
  console.info(`Exiting with code: ${code}`);
});

// Global Variables, So i can use them any where in this file easily
let loaded_data = {};
let num = 0;
const input_file = 'input.xlsx';
const output_json_file = './json/items_node.json';
const asset_data_folder = join(__dirname, './asset_data/');
let url = '';
const xlsxPath = `${__dirname}\\xlsx-in\\${input_file}`;

const asset_data_json = [];

// Function for writing the final data to XLSX file
const writeToDatabase = (slug, id, price, link, rank, buyerData, outcome) => {
  return new Promise(async (resolve, reject) => {
    try {
      const data = {
        SLUG: slug,
        ID: id,
        PRICE: price,
        LINK: link,
        RANK: rank,
        BuyerData: buyerData,
        // TRAIT: trait,
        // RULE: rule,
        // VALUE: value,
        // MINPROFIT: minProfit,
        isBought: false,
        Outcome: outcome,
        DATE: new Date(Date.now()).toISOString(),
      };

      const listing = new NewListings(data);
      await listing.save().then(() => {
        console.log(data, '\n');
      });
      return resolve('');
    } catch (e) {
      return reject(e);
    }
  });
};

// const getMostExpensiveTrait = (matchedTraits) => {
//   let TraitsToCompare = [];
//   for (let i = 0; i < matchedTraits.length; i++) {
//     const trait = matchedTraits[i];
//     if (trait.rule !== "BelowFloor") {
//       TraitsToCompare.push(trait);
//     }
//   }

// };

const checkIfTraitExists = (Traits) => {
  const matchedTraits = [];

  const data = xlsx.readFile(xlsxPath);
  const traitsData = xlsx.utils.sheet_to_json(data.Sheets['Traits']);
  for (let x = 0; x < Traits.length; x++) {
    for (let i = 0; i < traitsData.length; i++) {
      const Active = traitsData[i]['Active'];
      const trait = traitsData[i]['TRAITSET'];
      const _trait = Traits[x];
      if (Active == 'YES') {
        if (trait.includes(':') && _trait.includes(':')) {
          if (_trait.split(':')[0].trim() == trait.split(':')[0].trim()) {
            if (
              _trait
                .split(':')[1]
                .trim()
                .split('[')[0]
                .replace(/ /g, '')
                .trim() == trait.split(':')[1].trim()
            ) {
              matchedTraits.push({
                trait: trait,
                rule: traitsData[i]['Rule'],
                value: Number(traitsData[i]['Value']) * 100,
                minProfit: traitsData[i]['MinProfit'],
              });
            }
          }
          // else if (
          //   _trait.split(":")[1].trim().split("[")[0].replace(/ /g, "").trim()
          //     .length == 0
          // ) {
          //   matchedTraits.push({
          //     trait: trait,
          //     rule: traitsData[i]["Rule"],
          //     value: Number(traitsData[i]["Value"]) * 100,
          //     minProfit: traitsData[i]["MinProfit"],
          //   });
          // }
        }
      }
    }
  }
  return matchedTraits;
};

const extractTraits = (data, slug, id) => {
  const traits = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item.slug == slug && item.id == String(id)) {
      for (let x = 0; x < item.traits.split('|').length; x++) {
        const trait = item.traits.split('|')[x];
        traits.push(trait);
      }
    }
  }
  return traits;
};

const checkIfExistsInJSON = (
  slug,
  id,
  price,
  link,
  rank,
  // rule,
  // trait,
  // value,
  // minProfit
) => {

  return new Promise((resolve, reject) => {
    try {
      // let start = performance.now();

      // console.log(Traits);
      // let end = performance.now();
      // console.log((end - start) / 1000);
      const Traits = extractTraits(asset_data_json, slug, id);
      if (Traits.length > 0) {
        const matchedTraits = checkIfTraitExists(Traits);
        if (matchedTraits.length > 0) {
          const SHEET_SLUGS = [];
          const FLOORPRICES = [];
          const ROYALITIES = [];

          SheetData.find(async (error, result) => {
            if (error) throw error;
            if (result.length == 0) {
              throw new Error('No floor-price data is present in the database');
            }

            for (let n = 0; n < result.length; n++) {
              const row = result[n];
              SHEET_SLUGS.push(row.SLUG);
              FLOORPRICES.push(row.FLOORPRICE);
              ROYALITIES.push(row.ROYALTY);
            }

            for (let x = 0; x < matchedTraits.length; x++) {
              const trait = matchedTraits[x];
              const rule = trait.rule;
              const value = trait.value;

              const idx = SHEET_SLUGS.indexOf(slug);
              const floor_price = Number(FLOORPRICES[idx]);


              if (rule == 'BelowFloor') {
                const minPrice = ((100 - value) / 100) * floor_price;
                await writeToDatabase(
                  slug,
                  id,
                  price,
                  link,
                  rank,
                  matchedTraits,
                  minPrice,
                );
                return resolve(true);
              } else if (rule == 'AboveFloor') {
                const maxPrice =
                  ((100 - value) / 100) * floor_price + floor_price;
                await writeToDatabase(
                  slug,
                  id,
                  price,
                  link,
                  rank,
                  matchedTraits,
                  maxPrice,
                );
                return resolve(true);
              } else if (rule == 'Fixed') {
                await writeToDatabase(
                  slug,
                  id,
                  price,
                  link,
                  rank,
                  matchedTraits,
                  value,
                );
                return resolve(true);
              }
            }
          });

          return resolve(true);
        }
      }

      return resolve(false);

      // if (matchedTraits.length > 1) {
      //   let { rule, trait, value, minProfit } =
      //     getMostExpensiveTrait(matchedTraits);
      //   await writeToDatabase(
      //     slug,
      //     id,
      //     price,
      //     link,
      //     rank,
      //     rule,
      //     trait,
      //     value,
      //     minProfit
      //   );
      // } else if (matchedTraits.length == 1) {
      //   await writeToDatabase(
      //     slug,
      //     id,
      //     price,
      //     link,
      //     rank,
      //     matchedTraits[0].rule,
      //     matchedTraits[0].trait,
      //     matchedTraits[0].value,
      //     matchedTraits[0].minProfit
      //   );
      // }
    } catch (e) {
      console.log(e);
    }
  })


};

// Function for writing to the JSON file
const writeToJSON = (data) => {
  fs.writeFileSync(
    output_json_file,
    JSON.stringify(data),
    { flag: 'w' },
    'utf-8',
  );
};

// Function for appending to the JSON file
const appendToJSON = (data) => {
  const _data = JSON.parse(
    fs.readFileSync(output_json_file, { encoding: 'utf-8' }),
  );
  _data.push(data);
  writeToJSON(_data);
};

// Function for checking if the given ID exists in the Data
const isItemExists = (data, id) => {
  let itemExists = false;
  let index = 0;
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (id == item.id) {
      console.log(`Item Exists: ${item.slug} -- ${id}`);
      itemExists = true;
      index = i;
    }
  }
  return [itemExists, index];
};

// Function for checking if the item Already exists (to avoid duplicates)
const checkIfAlreadyExists = (slug, id, price, link, rank) => {
  return new Promise(async (resolve, reject) => {
    try {
      let data = {
        slug: '',
        id: '',
        time: '',
      };

      if (fs.existsSync(output_json_file)) {
        fs.readFile(output_json_file, 'utf-8', async (err, json) => {
          if (err) throw err;
          const data_obj = JSON.parse(json);
          const result = isItemExists(data_obj, id);
          const idx = result[1];
          if (result[0] == true) {
            const time = data_obj[idx].time;
            const hours = moment().diff(moment(time, true), 'hours');
            if (hours >= 24) {
              data_obj.splice(idx, 1);
              writeToJSON([data_obj]);
            }
            return resolve('');
          } else {
            data = {
              slug: slug,
              id: id,
              time: new Date(Date.now()),
            };
            const exists = await checkIfExistsInJSON(
              slug,
              id,
              price,
              link,
              rank,
              // rule,
              // trait,
              // value,
              // minProfit
            );
            if (exists) {
              appendToJSON(data);
            }

            return resolve('');
          }
        });
      } else {
        data = {
          slug: slug,
          id: id,
          time: new Date(Date.now()),
        };
        const exists = await checkIfExistsInJSON(
          slug,
          id,
          price,
          link,
          rank,
          // rule,
          // trait,
          // value,
          // minProfit
        );
        if (exists) {
          writeToJSON([data]);
        }
        return resolve('');
      }
    } catch (e) {
      return reject(e);
    }
  });
};

// Function for extracting the data from the GraphQL API Response
const extractNewListings = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      let idx = '';
      let rank = '';
      // let value = "";
      // let trait = "";
      // let rule = "";
      // let minProfit = "";

      const listings = data.data.assetEvents.edges;

      if (listings.length > 0) {
        for (let i = 0; i < listings.length; i++) {
          const listing = listings[i].node;
          if (
            typeof listing.assetQuantity !== 'undefined' &&
            listing.assetQuantity !== null &&
            listing.price.asset.symbol == 'ETH'
          ) {
            const price = String(
              parseFloat(listing.price.quantityInEth) / 10 ** 18,
            );
            const slug = listing.assetQuantity.asset.collection.slug;
            const id = listing.assetQuantity.asset.tokenId;
            const link = `https://opensea.io/assets/${listing.assetQuantity.asset.assetContract.address}/${id}`;

            // if (loaded_data.IDs.length > 0) {
            //   if (
            //     loaded_data.SLUGS.indexOf(slug) !== -1 &&
            //     loaded_data.IDs.indexOf(id) !== -1
            //   ) {
            //     idx = loaded_data.IDs.indexOf(id);
            //     rank = loaded_data.RANKS[idx];
            //     // value = loaded_data.VALUES[idx];
            //     // trait = loaded_data.TRAITS[idx];
            //     // rule = loaded_data.RULES[idx];
            //     // minProfit = loaded_data.MINPROFIT[idx];
            //     await checkIfAlreadyExists(
            //       slug,
            //       id,
            //       price,
            //       link,
            //       rank
            //       // rule,
            //       // trait,
            //       // value,
            //       // minProfit
            //     ).catch((e) => {
            //       throw e;
            //     });
            //   } else {
            //     if (loaded_data.SLUGS_2.indexOf(slug) !== -1) {
            //       idx = loaded_data.SLUGS_2.indexOf(slug);
            //       rank = loaded_data.RANKS_2[idx];
            //       // value = loaded_data.VALUES_2[idx];
            //       // trait = loaded_data.TRAITS_2[idx];
            //       // rule = loaded_data.RULES_2[idx];
            //       // minProfit = loaded_data.MINPROFIT_2[idx];
            //       await checkIfAlreadyExists(
            //         slug,
            //         id,
            //         price,
            //         link,
            //         rank
            //         // rule,
            //         // trait,
            //         // value,
            //         // minProfit
            //       ).catch((e) => {
            //         throw e;
            //       });
            //     }
            //   }
            // } else {
            if (
              loaded_data.SLUGS.indexOf(slug) !== -1 &&
              loaded_data.IDs.indexOf(id) !== -1
            ) {
              idx = loaded_data.IDs.indexOf(id);
              rank = loaded_data.RANKS[idx];
              // value = loaded_data.VALUES[idx];
              // trait = loaded_data.TRAITS[idx];
              // rule = loaded_data.RULES[idx];
              // minProfit = loaded_data.MINPROFIT[idx];
              await checkIfAlreadyExists(
                slug,
                id,
                price,
                link,
                rank,
                // rule,
                // trait,
                // value,
                // minProfit
              ).catch((e) => {
                throw e;
              });
            }
            // }
          }
        }
      }
      return resolve('');
    } catch (e) {
      return reject(e);
    }
  });
};

// Function for loading the data from the given excel file
// const loadExcelData = (path) => {
//   return new Promise((resolve, reject) => {
//     try {
//       let excelData = [];

//       let SLUGS = [];
//       let IDs = [];
//       let RANKS = [];
//       // let TRAITS = [];
//       // let RULES = [];
//       // let VALUES = [];
//       // let MINPROFIT = [];

//       let SLUGS_2 = [];
//       let IDs_2 = [];
//       let RANKS_2 = [];
//       // let TRAITS_2 = [];
//       // let RULES_2 = [];
//       // let VALUES_2 = [];
//       // let MINPROFIT_2 = [];

//       let slug_idx = 0;
//       let id_idx = 0;
//       let rank_idx = 0;
//       // let trait_idx = 0;
//       // let rule_idx = 0;
//       // let value_idx = 0;
//       // let minProfit_idx = 0;
//       let active_idx = 0;

//       const data = xlsx.readFile(path);
//       const keyField = xlsx.utils.sheet_to_csv(data.Sheets["Main"]);
//       keyField.split("\n").map((row) => {
//         excelData.push(row);
//       });

//       let header = excelData[0].split(",");
//       for (let i = 0; i < header.length; i++) {
//         const column = header[i].trim().split('"').join("");
//         if (column == "SLUG") {
//           slug_idx = i;
//         }
//         if (column == "ID") {
//           id_idx = i;
//         }
//         if (column == "RANK") {
//           rank_idx = i;
//         }
//         // if (column == "TRAIT") {
//         //   trait_idx = i;
//         // }
//         // if (column == "RULE") {
//         //   rule_idx = i;
//         // }
//         // if (column == "VALUE") {
//         //   value_idx = i;
//         // }
//         // if (column == "MINPROFIT") {
//         //   minProfit_idx = i;
//         // }
//         if (column == "ACTIVE") {
//           active_idx = i;
//         }
//       }

//       for (let n = 1; n < excelData.length - 1; n++) {
//         const row = excelData[n].split(",");
//         let active = row[active_idx];
//         if (active.trim() == "YES") {
//           if (row[id_idx].trim() == "ALL") {
//             SLUGS_2.push(row[slug_idx].trim());
//             IDs_2.push(row[id_idx].trim());
//             RANKS_2.push(row[rank_idx].trim());
//             // VALUES_2.push(row[value_idx].trim());
//             // TRAITS_2.push(row[trait_idx].trim());
//             // MINPROFIT_2.push(row[minProfit_idx].trim());
//             // RULES_2.push(row[rule_idx].trim());
//           } else {
//             SLUGS.push(row[slug_idx].trim());
//             IDs.push(row[id_idx].trim());
//             RANKS.push(row[rank_idx].trim());
//             // VALUES.push(row[value_idx].trim());
//             // TRAITS.push(row[trait_idx].trim());
//             // MINPROFIT.push(row[minProfit_idx].trim());
//             // RULES.push(row[rule_idx].trim());
//           }
//         }
//       }
//       return resolve({
//         SLUGS: SLUGS,
//         IDs: IDs,
//         RANKS: RANKS,
//         // VALUES: VALUES,
//         // TRAITS: TRAITS,
//         // MINPROFIT: MINPROFIT,
//         // RULES: RULES,
//         SLUGS_2: SLUGS_2,
//         IDs_2: IDs_2,
//         RANKS_2: RANKS_2,
//         // VALUES_2: VALUES_2,
//         // TRAITS_2: TRAITS_2,
//         // MINPROFIT_2: MINPROFIT_2,
//         // RULES_2: RULES_2,
//       });
//     } catch (e) {
//       return reject(e);
//     }
//   });
// };

const loadAllJSONFiles = () => {
  return new Promise((resolve, reject) => {
    try {
      const files = fs.readdirSync(asset_data_folder);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const data = JSON.parse(
          fs.readFileSync(join(__dirname, `./asset_data/${file}`), 'utf8'),
        );

        for (let x = 0; x < data.length; x++) {
          const item = data[x];
          asset_data_json.push(item);
        }
      }
      resolve('');
    } catch (e) {
      throw e;
    }
  });
};

const extractJSONData = () => {
  return new Promise((resolve, reject) => {
    try {
      const SLUGS = [];
      const IDs = [];
      const RANKS = [];

      for (let n = 0; n < asset_data_json.length; n++) {
        const item = asset_data_json[n];
        SLUGS.push(item.slug);
        IDs.push(item.id);
        RANKS.push(item.rank);
      }

      return resolve({
        SLUGS: SLUGS,
        IDs: IDs,
        RANKS: RANKS,
      });
    } catch (e) {
      return reject(e);
    }
  });
};

function removeDuplicates(a) {
  return Array.from(new Set(a));
}

const generateUrl = () => {
  return new Promise((resolve, reject) => {
    try {
      let slugs = [];
      // let slugs =
      //   loaded_data.SLUGS_2.length > 0
      //     ? [...loaded_data.SLUGS, ...loaded_data.SLUGS_2]
      //     : [loaded_data.SLUGS];
      // slugs = removeDuplicates(slugs);
      for (let x = 0; x < asset_data_json.length; x++) {
        const item = asset_data_json[x];
        slugs.push(item.slug);
      }
      slugs = removeDuplicates(slugs);
      const start = 'https://opensea.io/activity?';
      let middle = '';
      const end = '&search[eventTypes][0]=AUCTION_CREATED';

      for (let i = 0; i < slugs.length; i++) {
        const slug = slugs[i];
        if (i == 0) {
          middle = `search[collections][0]=${slug}`;
        } else {
          middle = `${middle}&search[collections][${i}]=${slug}`;
        }
      }

      url = `${start}${middle}${end}`;

      return resolve('Success');
    } catch (e) {
      return reject(e);
    }
  });
};

/**
 * @description Opens a browser, heads to the provided url of OpenSea, then start checking for new listings and export them in XLSX simultaneously
 */

const CrawlOpenSeaListings = async () => {
  try {
    // Checking if the url and XLSX file path are provided or not and throwing error if not provided
    // if (typeof process.argv[2] !== "undefined") {
    //   xlsxPath = process.argv[2].split("--file=")[1];
    // } else {
    //   console.error(
    //     '\nError: Please provide the Path to XLSX file.\nHere is an example for running this bot:\n\tnode main.js --file="C:/path/to/excel/file"'
    //   );
    //   process.exit(0);
    // }

    // Launch the browser and create a new page for working
    console.log('Launching the browser...');

    const browser = await puppeteer.launch({
      timeout: 0, // Timeout 0 for slow internet connections
      headless: true, // Headless True, so you won't get disturbed with an extra chromium browser opened in front of you
      ignoreHTTPSErrors: true, // Preventing Chromium from shuting down due to HTTPS errors
      ignoreHTTPErrors: true, // Preventing Chromium from shuting down due to HTTP errors
      args: ['--start-maximized'], // Starting the window with maximum viewport
      defaultViewport: { width: 1920, height: 1080 },
      ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'], // simple workaround, so website will think its not a bot
      slowMo: 0, // Speed of working, setting it to 0 can cause problems because puppeteer will work with full speed and website can easily recognize the bot
    });

    const page = await browser.newPage(); // New page so the bot can use it for doing the crawling part

    console.log('Browser launched, configuring the new page...');

    // Setting default timeouts to 0 (it's for slow internet connections)
    page.setDefaultNavigationTimeout(0); // setting it for slow internet connection
    page.setDefaultTimeout(0); // setting it for slow internet connection

    // Setting a good userAgent because with the default one, the website will recognize the bot
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false, // setting the webdriver value to false, so the website will think its not a bot
      });
      window.navigator.chrome = {
        runtime: {}, // just another workaround
      };
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5], // you can pass anything because website will check the length of pulgins array
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'], // optional, just tell the website to render things in english
      });
      const originalQuery = window.navigator.permissions.query;
      return (window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) : // Accepting notifications, so they won't interupt the bot
          originalQuery(parameters));
    });

    await page.setRequestInterception(true); // setting to true so we can intercept the request and change parameters

    page.on('request', (req) => {
      const url = req.url();
      if (
        // if website is trying to send a request for captcha or to cloudflare, it will block it so they can't disturb the bot
        url.toString().toLowerCase().indexOf('captcha') != -1 ||
        url.toString().toLowerCase().indexOf('cloudflare') != -1
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Intercepting the Response of GraphQL API, OpenSea uses it to get data for new listing
    // and we can easily extract that data and do what ever we want to do with it.
    page.on('response', async (res) => {
      if (
        res.request().url().toLowerCase() ==
        'https://api.opensea.io/graphql/' &&
        res.request().method() == 'POST'
      ) {
        if (num > 1) {
          await res
            .json()
            .then(async (graphql_res) => {
              await extractNewListings(graphql_res).catch((e) => {
                throw e;
              });
            })
            .catch((e) => {
              throw e;
            });
        } else {
          num++;
        }
      }
    });

    console.log(
      'Configuration completed, navigating to the given OpenSea url...',
    );

    // Load the excel file and start the process
    // await loadExcelData(xlsxPath)
    // .then(async (data) => {
    // loaded_data = data;
    await loadAllJSONFiles();
    loaded_data = await extractJSONData();
    await generateUrl().catch((e) => {
      throw e;
    });
    console.log(url);
    await page.goto(url, { timeout: 0, referer: 'https://opensea.io/' });
    console.log('Website opened, checking for new listings...\n');
    // })
    // .catch((e) => {
    //   throw e;
    // });
  } catch (error) {
    console.log(error);
  }
};

CrawlOpenSeaListings();

