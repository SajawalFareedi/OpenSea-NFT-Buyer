/* eslint-disable linebreak-style */
const Mongoose = require('../db_client');

const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const NewListingsSchema = new Schema({
  ITEM: ObjectId,
  SLUG: String,
  ID: String,
  PRICE: String,
  LINK: String,
  RANK: String,
  BuyerData: Array,
  // RULE: String,
  // VALUE: String,
  // MINPROFIT: String,
  isBought: {type: Boolean, default: false},
  Outcome: Number,
  DATE: {type: Date},
});

const SheetDataSchema = new Schema({
  ITEM: ObjectId,
  SLUG: String,
  FLOORPRICE: String,
  TIMESTAMP: String,
  COLLECTION: String,
  ROYALTY: String,
  DATE: {type: Date, default: Date.now},
});

const NewListings = Mongoose.model('NewListings', NewListingsSchema);

const SheetData = Mongoose.model('SheetData', SheetDataSchema);

module.exports = {NewListings, SheetData};
