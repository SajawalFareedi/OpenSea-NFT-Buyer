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
        isBought: false,
        Outcome: Number(outcome.toFixed(2)),
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

const checkIfTraitExists = (Traits, __slug) => {
  const matchedTraits = [];

  const data = xlsx.readFile(xlsxPath);
  const traitsData = xlsx.utils.sheet_to_json(data.Sheets['Traits']);
  for (let x = 0; x < Traits.length; x++) {
    for (let i = 0; i < traitsData.length; i++) {
      const Active = traitsData[i]['Active'];
      const excelSlug = traitsData[i]['Slug'];
      const trait = traitsData[i]['TRAITSET'];
      const _trait = Traits[x];
      if (Active == 'YES') {
        if (excelSlug == __slug) {
          if (trait.includes(':') && _trait.includes(':')) {
            const slug = trait.split(':')[0].trim();
            const _slug = _trait.split(':')[0].trim();
            if (slug == _slug) {
              const json_trait = _trait.split(':')[1].trim().split('[')[0].replace(/ /g, '').trim();
              const excel_trait = trait.split(':')[1].trim();
              if (json_trait == excel_trait) {
                matchedTraits.push({
                  trait: trait,
                  rule: traitsData[i]['Rule'],
                  value: Number(traitsData[i]['Value']) * 100,
                  minProfit: traitsData[i]['MinProfit'],
                });
              }
            }
          }
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

const checkIfExistsInJSON = (slug, id, price, link, rank) => {
  return new Promise((resolve, reject) => {
    try {
      const Traits = extractTraits(asset_data_json, slug, id);
      if (Traits.length > 0) {
        const matchedTraits = checkIfTraitExists(Traits, slug);
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
                if (!isNaN(minPrice)) {
                  await writeToDatabase(slug, id, price, link, rank, matchedTraits, minPrice);
                }
                return resolve(true);
              } else if (rule == 'AboveFloor') {
                const maxPrice = ((100 - value) / 100) * floor_price + floor_price;
                if (!isNaN(maxPrice)) {
                  await writeToDatabase(slug, id, price, link, rank, matchedTraits, maxPrice);
                }
                return resolve(true);
              } else if (rule == 'Fixed') {
                if (!isNaN(value)) {
                  await writeToDatabase(slug, id, price, link, rank, matchedTraits, value);
                  return resolve(true);
                }
              }
            }
          });
          return resolve(true);
        }
      }

      return resolve(false);
    } catch (e) {
      console.log(e);
    }
  });
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

            if (
              loaded_data.SLUGS.indexOf(slug) !== -1 &&
              loaded_data.IDs.indexOf(id) !== -1
            ) {
              idx = loaded_data.IDs.indexOf(id);
              rank = loaded_data.RANKS[idx];
              await checkIfAlreadyExists(
                slug,
                id,
                price,
                link,
                rank,
              ).catch((e) => {
                throw e;
              });
            }
          }
        }
      }
      return resolve('');
    } catch (e) {
      return reject(e);
    }
  });
};

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

    await loadAllJSONFiles();
    loaded_data = await extractJSONData();
    await generateUrl().catch((e) => {
      throw e;
    });
    console.log(url);
    await page.goto(url, { timeout: 0, referer: 'https://opensea.io/' });
    console.log('Website opened, checking for new listings...\n');
  } catch (error) {
    console.log(error);
  }
};

CrawlOpenSeaListings();

