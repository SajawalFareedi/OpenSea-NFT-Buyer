const xlsx = require("xlsx");
const Excel = require("exceljs");
const Puppeteer = require("Puppeteer-extra").default;
const pluginStealth = require("Puppeteer-extra-plugin-stealth");
const Cheerio = require("cheerio").default;
const { join } = require("path");
const fs = require("fs");

Puppeteer.use(pluginStealth());

const excelFilePath = join(__dirname, "../xlsx-in/input.xlsx");
const txtFile = join(__dirname, "./excelUpdaterHelper.txt");

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

const openBrowser = async () => {
  try {
    const browser = await Puppeteer.launch({
      timeout: 0,
      headless: true,
      ignoreHTTPSErrors: true,
      ignoreHTTPErrors: true,
      args: ["--start-maximized"],
      defaultViewport: { width: 1920, height: 1080 },
      ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
      slowMo: 0,
    });

    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.82 Safari/537.36"
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
      window.navigator.chrome = {
        runtime: {},
      };
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      const originalQuery = window.navigator.permissions.query;
      return (window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters));
    });

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url().toString().toLowerCase();
      if (url.indexOf("captcha") != -1 || url.indexOf("cloudflare") != -1) {
        req.abort();
      } else {
        req.continue();
      }
    });

    return page;
  } catch (error) {
    console.log(error);
  }
};

function numToAlpha(num) {
  var s = "";
  var t;

  while (num > 0) {
    t = (num - 1) % 26;
    s = String.fromCharCode(65 + t) + s;
    num = ((num - t) / 26) | 0;
  }
  return s || undefined;
}

const writeToExcel = async (forSale, Price, row, priceColumn) => {
  try {
    let priceCol = numToAlpha(priceColumn);

    const workbook = new Excel.Workbook();

    workbook.xlsx.readFile(excelFilePath).then(function () {
      const worksheet = workbook.getWorksheet("Traits");
      const currentRow = worksheet.getRow(row);
      currentRow.getCell("O").value = forSale;
      currentRow.getCell(`${priceCol}`).value = Price;
      currentRow.commit();
      return workbook.xlsx.writeFile(excelFilePath);
    });
  } catch (e) {
    throw e;
  }
};

const updatePriceColumn = (currentIdx) => {
  let newIdx = currentIdx + 1;
  fs.writeFileSync(txtFile, String(newIdx), "utf8");
};

const updateData = async (loaded_data) => {
  try {
    let price_idx = Number(fs.readFileSync(txtFile, "utf8"));

    const Page = await openBrowser();

    for (let i = 0; i < loaded_data.data.length; i++) {
      const row = loaded_data.data[i];
      const url = row.URL;
      const TraitSet = row.TRAITSET;
      const Slug = row.Slug;

      await Page.goto(url);
      const content = await Page.content();
      const $ = Cheerio.load(content);

      const forSale = $(".kejuyj").text().split(" ")[0].trim();
      const Prices = $(".AssetCardFooter--price-amount .Price--amount")
        .text()
        .split(" ");
      let prices = [];
      for (let x = 0; x < Prices.length - 1; x++) {
        const n = Prices[x];
        prices.push(Number(n));
      }
      const Price = Math.min(...prices);

      await writeToExcel(forSale, Price, i + 2, price_idx);
      console.log(`${Slug} -- ${TraitSet}: ${forSale} -- ${Price}`);
      await sleep(10);
    }
    updatePriceColumn(price_idx);
    console.log(
      `All of the data is updated | timestamp: ${new Date().toISOString()}\n`
    );
  } catch (e) {
    console.log(e);
  }
};

const loadExcelData = () => {
  return new Promise((resolve, reject) => {
    try {
      let price_idx = 24;
      const data = xlsx.readFile(excelFilePath);
      const keyField = xlsx.utils.sheet_to_json(data.Sheets["Traits"]);
      const keys = Object.keys(keyField[0]);
      // const forSale_idx = keys.indexOf("For Sale");

      price_idx = fs.readFileSync(txtFile, "utf8");

      if (price_idx.trim().length == 0) {
        price_idx = keys.indexOf("SCRAPED DATA");
      }

      fs.writeFileSync(txtFile, String(Number(price_idx) + 1), "utf8");

      return resolve({
        data: keyField,
      });
    } catch (e) {
      return reject(e);
    }
  });
};

console.log("Updating the Excel Sheet...");

(async () => {
  const loaded_data = await loadExcelData();
  await updateData(loaded_data);
})();

// setInterval(async () => {
//   const loaded_data = await loadExcelData();
//   await updateData(loaded_data);
// }, 1000 * 60 * 60 * 6); // 6hrs delay

// writeToExcel(1455, 0.9, 2, 25);
// loadExcelData();
