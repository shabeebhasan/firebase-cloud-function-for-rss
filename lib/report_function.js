"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const functions = require("firebase-functions");
const FeedMe = require("feedme");
const request = require("request");
const path = require("path");
const fs = require("fs");
const stringify = require("csv-stringify");
const countries_1 = require("./countries");
const admin_1 = require("./admin");
const ADD_TO_LIST = "ADDED_TO_LIST";
const REMOVE_TO_LIST = "REMOVED_TO_LIST";
const RAW_TEMP_DIRECTORY = path.resolve(__dirname, '../../tmp') + "/raw/";
const FINAL_TEMP_DIRECTORY = path.resolve(__dirname, '../../tmp') + "/final/";
const REPORTL_TEMP_DIRECTORY = path.resolve(__dirname, '../../tmp') + "/report/";
const bucket = admin_1.admin
    .storage()
    .bucket();
const db = admin_1.admin.database();
let DAYS_AGO = 7;
const feedlyReportFunction = functions
    .https
    .onRequest((req, callback) => {
    if (!fs.existsSync(RAW_TEMP_DIRECTORY)) {
        fs.mkdirSync(RAW_TEMP_DIRECTORY);
    }
    if (!fs.existsSync(FINAL_TEMP_DIRECTORY)) {
        fs.mkdirSync(FINAL_TEMP_DIRECTORY);
    }
    if (!fs.existsSync(REPORTL_TEMP_DIRECTORY)) {
        fs.mkdirSync(REPORTL_TEMP_DIRECTORY);
    }
    console.log("calling FEEDLY_WRITE_REPORTS");
    let filename = req.query.filename;
    let country = req.query.country;
    let version = req.query.version;
    if (req.query.daysago) {
        DAYS_AGO = req.query.daysago;
    }
    if (!country) {
        callback.send('ERROR:: country variable is undefined.');
    }
    if (!version) {
        callback.send('ERROR:: version variable is undefined.');
    }
    if (!filename) {
        callback.send('ERROR:: filename variable is undefined.');
    }
    if (country.toLowerCase() === 'all') {
        countries_1.countries.forEach(element => {
            let countryCode = element.code;
            let countryName = element.name;
            const jsonFileName = filename + '_' + countryCode + "_" + version + ".json";
            downloadFileAndRead(jsonFileName).then(function (res) {
                console.log("DONE ::", jsonFileName);
            })
                .catch(function (ex) {
                console.log("ERROR IN ::", jsonFileName);
            });
        });
    }
    else {
        const countries_params = country.split(',');
        countries_params.forEach(countryCode => {
            const countryName = getCountryNameFromCode(countryCode);
            const jsonFileName = filename + '_' + countryCode + "_" + version + ".json";
            downloadFileAndRead(jsonFileName).then(function (res) {
                console.log(res);
            })
                .catch(function (ex) {
                console.log(ex);
            });
        });
    }
    callback.send(`DONE`);
});
exports.feedlyReportFunction = feedlyReportFunction;
function doRequest(url) {
    return new Promise(function (resolve, reject) {
        let urlRequest = request(url, { timeout: 1500 });
        urlRequest.on('error', (error) => {
            reject(error);
        });
        urlRequest.on('response', function (res) {
            const parser = new FeedMe();
            res.pipe(parser);
            parser.on('item', (item) => {
                let updatedDate;
                if (item.pubdate) {
                    updatedDate = Date.parse(item.pubdate);
                }
                else if (item.published) {
                    updatedDate = Date.parse(item.published);
                }
                else if (item.updated) {
                    updatedDate = Date.parse(item.updated);
                }
                else if (item['dc:date']) {
                    updatedDate = Date.parse(item['dc:date']);
                }
                const dateago = new Date();
                const printUpdatedDate = new Date();
                printUpdatedDate.setTime(updatedDate);
                dateago.setTime(dateago.getTime() - (DAYS_AGO * 24 * 60 * 60 * 1000));
                let response = {
                    dateago: dateago,
                    printUpdatedDate: printUpdatedDate,
                    status: REMOVE_TO_LIST,
                    item: item
                };
                if (updatedDate >= dateago.getTime()) {
                    response.status = ADD_TO_LIST;
                    resolve(response);
                }
                else {
                    response.status = REMOVE_TO_LIST;
                    resolve(response);
                }
            });
            parser.on('error', (error) => {
                reject(error);
            });
        });
    });
}
function ReadFeed(feedData, completeFileName) {
    return new Promise(function (resolve, reject) {
        return __awaiter(this, void 0, void 0, function* () {
            const writeArry = [];
            const reportArray = [];
            for (let i = 0; i < feedData.length; i++) {
                try {
                    const result = yield doRequest(feedData[i].multi_url);
                    if (result.status === ADD_TO_LIST) {
                        // console.log("RESULT:: ", response.status) console.log('doRequest:: ' +
                        // completeFileName + " ADD_TO_LIST:: ", feedData[i].multi_url);
                        // console.log("DAYS_AGO:: ", DAYS_AGO); console.log("dateago:: ",
                        // response.dateago); console.log("updatedDate:: ", response.printUpdatedDate);
                        writeArry.push(feedData[i]);
                    }
                    else {
                        // console.log("RESULT:: ", response.status) console.log('doRequest:: ' +
                        // completeFileName + " REMOVE_TO_LIST:: ", feedData[i].multi_url);
                        // console.log("DAYS_AGO:: ", DAYS_AGO); console.log("dateago:: ",
                        // response.dateago); console.log("updatedDate:: ", response.printUpdatedDate);
                        console.log("ITEM:: ", result.item);
                    }
                    const report = {
                        RESULT: result.status,
                        FEED_URL: feedData[i].multi_url,
                        DAYS_AGO: DAYS_AGO,
                        LAST_UPDATED_DATE: result
                            .printUpdatedDate
                            .toISOString()
                            .replace(/T/, ' ')
                            .replace(/\..+/, ''),
                        DATE_NOW: new Date()
                            .toISOString()
                            .replace(/T/, ' ')
                            .replace(/\..+/, '')
                    };
                    console.log("REPORT:: ", report);
                    reportArray.push(report);
                }
                catch (ex) {
                    console.log('error:: doRequest:: ' + ex.toString());
                }
            }
            const response = {
                writeArry: writeArry,
                reportArray: reportArray
            };
            resolve(response);
        });
    });
}
function downloadFileAndRead(filename) {
    return __awaiter(this, void 0, void 0, function* () {
        const completeFileName = "FeedSources_RAW/" + filename;
        const file = bucket.file(completeFileName);
        try {
            yield file.download({
                destination: RAW_TEMP_DIRECTORY + filename
            });
            console.log('downloadedFile:: ', completeFileName);
            const rawdata = fs.readFileSync(RAW_TEMP_DIRECTORY + filename);
            const feedData = JSON.parse(rawdata.toString());
            const response = yield ReadFeed(feedData, completeFileName);
            const writeArry = response.writeArry;
            const reportArray = response.reportArray;
            writeCSV(filename, reportArray);
            //write json to firebase storage
            const data = JSON.stringify(writeArry);
            const jsonFile = FINAL_TEMP_DIRECTORY + filename;
            const uploadFile = "FeedSources/" + filename;
            fs.writeFileSync(jsonFile, data);
            bucket
                .upload(jsonFile, { destination: uploadFile })
                .then((res) => {
                console.log('bucket.upload:: ', filename);
            })
                .catch((err) => {
                console.log('bucket.upload:: ', err);
            });
        }
        catch (ex) {
            console.log('error:: downloadFile:: ', completeFileName);
        }
    });
}
function writeCSV(filename, reportArray) {
    const cvsFilename = filename + ".csv";
    const columns = {
        FEED_URL: "FEED_URL",
        DAYS_AGO: "DAYS_AGO",
        LAST_UPDATED_DATE: "LAST_UPDATED_DATE",
        DATE_NOW: "DATE_NOW",
        RESULT: "RESULT"
    };
    stringify(reportArray, {
        header: true,
        columns: columns
    }, (error, output) => {
        if (error)
            throw error;
        fs.writeFile(REPORTL_TEMP_DIRECTORY + cvsFilename, output, (e) => {
            if (e)
                throw e;
            console.log('csv saved.', cvsFilename);
            const uploadFile = "FeedSources_Reports/" + cvsFilename;
            bucket
                .upload(REPORTL_TEMP_DIRECTORY + cvsFilename, { destination: uploadFile })
                .then((res) => {
                console.log('bucket.upload:: ', cvsFilename);
            })
                .catch((err) => {
                console.log('bucket.upload:: ', err);
            });
        });
    });
}
function getCountryNameFromCode(countryCode) {
    let countryName = '';
    countries_1.countries.forEach(element => {
        if (element.code.toLowerCase() === countryCode.toLowerCase()) {
            countryName = element.name;
        }
    });
    return countryName;
}
//# sourceMappingURL=report_function.js.map