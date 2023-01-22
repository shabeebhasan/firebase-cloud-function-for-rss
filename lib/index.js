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
const request = require("request");
const path = require("path");
const fs = require("fs");
const csv = require("csvtojson");
const readline = require("readline");
const admin_1 = require("./admin");
const countries_1 = require("./countries");
const report_function_1 = require("./report_function");
const clean_function_1 = require("./clean_function");
const url_feeds_1 = require("./url_feeds");
const bucket = admin_1.admin
    .storage()
    .bucket();
const db = admin_1.admin.database();
const TEMP_DIRECTORY = path.resolve(__dirname, '../../tmp') + "/";
const CONFIG_FILE = TEMP_DIRECTORY + 'config.json';
const SPOTIFY_TRENDS_FILE = TEMP_DIRECTORY + 'SPOTIFY_TRENDS_FILE.csv';
const SPOTIFY_TRENDS_FILE_REMOVED_1ST_LINE = TEMP_DIRECTORY + 'SPOTIFY_TRENDS_FILE_REMOVED_1ST_LINE.csv';
const MOVIE_API_KEY = "MOVIE_API_KEY";
const YOUTUBE_API_KEY = "YOUTUBE_API_KEY";
const FEEDLY_URL_COUNT = 50;
const FEEDLY_URL = 'https://cloud.feedly.com//v3/search/feeds?count=' + FEEDLY_URL_COUNT;
exports.CALL_FEEDS_URLS = url_feeds_1.feedsFuntion;
//report functions
exports.FEEDLY_REPORTS = report_function_1.feedlyReportFunction;
//clean function
exports.FEED_CLEAN = clean_function_1.feedCleanFunction;
exports.FEEDLY_WRITE_FEEDS = functions
    .https
    .onRequest((req, callback) => {
    let filename = req.query.filename;
    let searchTerms = req.query.searchterms;
    let country = req.query.country;
    let tagFilter = req.query.tagfilter;
    let version = req.query.version;
    let locale = req.query.locale;
    if (!country) {
        callback.send('ERROR:: country variable is undefined.');
    }
    if (!tagFilter) {
        callback.send('ERROR:: tagfilter variable is undefined.');
    }
    if (!version) {
        callback.send('ERROR:: version variable is undefined.');
    }
    if (!searchTerms) {
        callback.send('ERROR:: searchterms variable is undefined.');
    }
    if (!filename) {
        callback.send('ERROR:: filename variable is undefined.');
    }
    tagFilter = tagFilter.split(',');
    if (country.toLowerCase() === 'all') {
        countries_1.countries.forEach(element => {
            let countryCode = element.code;
            let countryName = element.name;
            let url = FEEDLY_URL + '&query=' + searchTerms + '&locale=' + countryCode;
            if (locale) {
                url = FEEDLY_URL + '&query=' + searchTerms + '&locale=' + locale;
            }
            loadFeedlyData(url, tagFilter, version, countryName, countryCode, filename);
        });
    }
    else {
        let countries_params = country.split(',');
        countries_params.forEach(countryCode => {
            let countryName = getCountryNameFromCode(countryCode);
            let url = FEEDLY_URL + '&query=' + searchTerms + '&locale=' + countryCode;
            if (locale) {
                url = FEEDLY_URL + '&query=' + searchTerms + '&locale=' + locale;
            }
            if (countryName !== '') {
                loadFeedlyData(url, tagFilter, version, countryName, countryCode, filename);
            }
        });
    }
    callback.send(`DONE`);
});
function getCountryNameFromCode(countryCode) {
    let countryName = '';
    countries_1.countries.forEach(element => {
        if (element.code.toLowerCase() === countryCode.toLowerCase()) {
            countryName = element.name;
        }
    });
    return countryName;
}
function loadFeedlyData(url, tagFilter, version, countryName, countryCode, filename) {
    console.log("FETCHING FOR FEEDLY URL:: ", url);
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            let writeArry = [];
            body
                .results
                .forEach(element => {
                //properties set for feeds
                let item = {
                    multi_url: element
                        .feedId
                        .split('')
                        .slice(5)
                        .join(''),
                    id: element.title,
                    parent_name: countryName + " Local News",
                    execution_time: 5
                };
                //add the feeds with matched tag filters
                if (element.deliciousTags) {
                    let tagsMatched = false;
                    for (let i = 0; i < element.deliciousTags.length; i++) {
                        let tag = element.deliciousTags[i];
                        for (let j = 0; j < tagFilter.length; j++) {
                            let filter = tagFilter[j];
                            if (tag.toLowerCase() === filter.toLowerCase()) {
                                tagsMatched = true;
                                break;
                            }
                        }
                    }
                    console.log("tagsMatched:: " + element.deliciousTags + " ", tagsMatched);
                    if (tagsMatched) {
                        writeArry.push(item);
                        console.log("WRITE ITEM FOR TAGS:: " + element.deliciousTags + " ", tagsMatched);
                    }
                    else {
                        console.log("NONE WRITE ITEM FOR TAGS:: " + element.deliciousTags + " ", tagsMatched);
                    }
                }
            });
            //write json to firebase storage
            let data = JSON.stringify(writeArry);
            const jsonFileName = filename + '_' + countryCode + "_" + version + ".json";
            const jsonFile = TEMP_DIRECTORY + jsonFileName;
            const uploadFile = "FeedSources_RAW/" + jsonFileName;
            fs.writeFileSync(jsonFile, data);
            bucket
                .upload(jsonFile, { destination: uploadFile })
                .then((file) => {
                console.log('bucket.upload:: ', jsonFileName);
            })
                .catch((err) => {
                console.log('bucket.upload:: ', err);
            });
        }
    });
}
exports.CALL_APIS = functions
    .https
    .onRequest((req, callback) => {
    getApiKeysFromDB(callback);
});
exports.SPOTIFY_TRENDS = functions
    .https
    .onRequest((req, callback) => {
    const csvFileURL = 'https://spotifycharts.com/regional/global/daily/latest/download';
    let dbKey = "/souceversion/spotify_trends/" + Date.now() + "/";
    let ref = db.ref(dbKey);
    downloadFile(csvFileURL, SPOTIFY_TRENDS_FILE, function () {
        csv()
            .fromFile(SPOTIFY_TRENDS_FILE_REMOVED_1ST_LINE)
            .then((jsonObj) => {
            for (let i = 0; i < jsonObj.length; i++) {
                ref.push(jsonObj[i]);
            }
            callback.send(`DONE`);
        });
    });
});
function downloadFile(url, dest, cb) {
    const file = fs.createWriteStream(dest);
    const sendReq = request.get(url);
    // verify response code
    sendReq.on('response', function (response) {
        if (response.statusCode !== 200) {
            return cb('Response status was ' + response.statusCode);
        }
    });
    sendReq.pipe(file);
    file.on('finish', function () {
        file.close(); // close() is async, call cb after close completes.
        removeFirstLine(dest, SPOTIFY_TRENDS_FILE_REMOVED_1ST_LINE, cb);
    });
}
;
function removeFirstLine(srcPath, destPath, done) {
    const rl = readline.createInterface({
        input: fs.createReadStream(srcPath)
    });
    const output = fs.createWriteStream(destPath);
    let firstRemoved = false;
    rl.on('line', (line) => {
        if (!firstRemoved) {
            firstRemoved = true;
            return;
        }
        output.write(line + '\n');
    }).on('close', () => {
        return done();
    });
}
function getApiKeysFromDB(callback) {
    let ref = db.ref("/keys/");
    ref.on("value", function (snapshot) {
        let tmdbKey = snapshot.val()[MOVIE_API_KEY];
        let ytKey = snapshot.val()[YOUTUBE_API_KEY];
        console.log("RUNNING getApiKeysFromDB");
        Promise.all([
            tmdbApi(tmdbKey, "popular"),
            tmdbApi(tmdbKey, "top_rated"),
            tmdbApi(tmdbKey, "latest"),
            tmdbApi(tmdbKey, "now_playing"),
            tmdbApi(tmdbKey, "upcoming"),
            youtube(ytKey)
        ]).then((res) => {
            console.log(res);
            callback.send(res);
        }).catch((err) => {
            callback.send(err);
        });
        ;
    });
}
function youtube(api_key) {
    return new Promise((resolve, reject) => {
        let apiUrl = "https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&maxR" +
            "esults=50&key=" + api_key;
        request({
            url: apiUrl,
            json: true
        }, function (error, response, body) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!error && response.statusCode === 200) {
                    let items = body.items;
                    for (let i = items.length - 1; i > 0; i--) {
                        let item = items[i];
                        let dbKey = "/souceversion/apis/youtube/global_trends/" + item.id + "/";
                        let ref = db.ref(dbKey);
                        yield ref.set(item);
                    }
                    resolve('DONE: ' + apiUrl);
                }
                else {
                    resolve('ERROR: ' + apiUrl);
                }
            });
        });
    });
}
function tmdbApi(api_key, edge) {
    return new Promise((resolve, reject) => {
        let apiUrl = "https://api.themoviedb.org/3/movie/" + edge + "?api_key=" + api_key;
        console.log("tmdbApi url: ", apiUrl);
        request({
            url: apiUrl,
            json: true
        }, function (error, response, body) {
            return __awaiter(this, void 0, void 0, function* () {
                // console.log("error: ",error) console.log("response: ",response)
                // console.log("body: ",body)
                if (!error && response.statusCode === 200) {
                    if (edge == "latest") {
                        let dbKey = "/souceversion/apis/themoviedb/" + edge + "/" + body.id + "_" + body
                            .title
                            .replace(/[^a-zA-Z0-9]/g, "") + "/";
                        let ref = db.ref(dbKey);
                        yield ref.set(body);
                        resolve('DONE: ' + apiUrl);
                    }
                    else {
                        let items = body.results;
                        for (let i = items.length - 1; i > 0; i--) {
                            let item = items[i];
                            let dbKey = "/souceversion/apis/themoviedb/" + edge + "/" + item.id + "_" + item
                                .title
                                .replace(/[^a-zA-Z0-9]/g, "") + "/";
                            let ref = db.ref(dbKey);
                            yield ref.set(item);
                        }
                        resolve('DONE: ' + apiUrl);
                    }
                }
                else {
                    resolve('ERROR: ' + apiUrl);
                }
            });
        });
    });
}
//# sourceMappingURL=index.js.map