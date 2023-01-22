import * as functions from 'firebase-functions';
import * as FeedMe from 'feedme';
import * as request from "request";
import * as remoteConfig from '../js/remote-config';
import * as path from "path";
import * as fs from "fs";
import * as grabity from "grabity";
import * as csv from "csvtojson";
import * as readline from "readline";
import {admin} from "./admin";
import * as Queue from "better-queue";
import {callbackify} from 'util';

const bucket = admin
    .storage()
    .bucket();
const db = admin.database();
const TEMP_DIRECTORY = path.resolve(__dirname, '../../tmp') + "/";
const CONFIG_FILE = TEMP_DIRECTORY + 'config.json';

const feedsFuntion = functions
    .https
    .onRequest((req, callback) => {
        remoteConfig.call('get', remoteConfigLoaded.bind({callback: callback, completion: completionFeedDataLoaded}));
    });

async function remoteConfigLoaded() {

    const feedDataArray = []
    let rawdata = fs.readFileSync(CONFIG_FILE);
    let jsonCofig = JSON.parse(rawdata.toString());
    let parameters = jsonCofig['parameters'];

    for (let key in parameters) {
        let value = parameters[key].defaultValue.value;
        let filename = key + "_" + value + ".json";
        console.log("filename is " + filename);
        let file = bucket.file('FeedSources/' + filename);
        try {
            let data = await file.download()
            let feedData = JSON.parse(data.toString())
            for (let i = 0; i < feedData.length; i++) {
                feedDataArray.push({feedItem: feedData[i], key: key, value: value})
            }
        } catch (ex) {
            console.log(filename, " not exist..")
        }
    }
    console.log("Loaded ALL FEED DATA");
    this.completion(feedDataArray)
}

async function completionFeedDataLoaded(feedDataArray) {
    console.log(feedDataArray);
    let urlsToProcess = []
    let previewArray = []
    console.log('feedDataArray.length:', feedDataArray.length)
    for (let i = 0; i < feedDataArray.length; i++) {
        let urls = await firebaseReadData(feedDataArray[i].feedItem, feedDataArray[i].key, feedDataArray[i].value);
        urlsToProcess.push(urls)
    }
    console.log("urlsToProcess:: ", urlsToProcess.length)

    //load of urls
    for (let i = 0; i < urlsToProcess.length; i++) {
        console.log("results[" + i + "]:: ", urlsToProcess[i])
        for (let j = 0; j < urlsToProcess[i].length; j++) {
            console.log(urlsToProcess[i][j]['url'])
            const dbKey = urlsToProcess[i][j]['dbKey'];
            const url = urlsToProcess[i][j]['url'];
            let data = await loadFeedsFromUrl(url, dbKey)
            previewArray.push(data);
            let refLastExecute = db.ref("/last_execute_time/" + dbKey);
            await refLastExecute.update({
                execute_time: Date.now()
            })
        }
    }
    console.log("Preview Data: ", previewArray);
    let q = previewQueue();

    for (let i = 0; i < previewArray.length; i++) {
        for (let j = 0; j < previewArray[i].length; j++) {
            const link = previewArray[i][j]['link'];
            const previewItemKey = previewArray[i][j]['previewItemKey'];
            let itemRef = db.ref(previewItemKey);
            q.push({link: link, itemRef: itemRef})
        }
    }

    q.on('empty', (function () {
        console.log("ALL PRVIEWS ARE LOADED")
        this
            .callback
            .send("ALL FEEDS ARE LOADED WITH PREVIEWS..");
    }).bind(this))
}

function previewQueue() {
    return new Queue(loadPreviewsFromUrl, {concurrent: 10});
}

async function firebaseReadData(feedItem, category, version) {
    let dbKey = "";
    let url = "";
    let uniqueOperationId = "";
    let item_execute_time = "";
    let urlsToLoad = [];

    if (feedItem.execution_time != "") {
        item_execute_time = feedItem.execution_time;
    }

    if (feedItem.multi_url != "" && feedItem.multi_id != "") {

        //working of non multi id feeds
        url = feedItem.multi_url;
        uniqueOperationId = feedItem.multi_id;
        //urlRequest = request({url: url, timeout: 5000});
        let parent_name = feedItem.parent_name;

        dbKey = "/souceversion/" + category + "/" + parent_name.replace(/[^a-zA-Z0-9]/g, "") + "/" + uniqueOperationId.replace(/[^a-zA-Z0-9]/g, "") + ":" + version + "/";

    } else {
        //working of non multi id feeds
        url = feedItem.feeds_url;
        uniqueOperationId = feedItem.uniqueOperationId;
        //urlRequest = request({url: url, timeout: 5000});
        dbKey = "/souceversion/" + category + "/" + uniqueOperationId.replace(/[^a-zA-Z0-9]/g, "") + ":" + version + "/";
    }

    let refLastExecute = db.ref("/last_execute_time/" + dbKey);
    let snapshot = await refLastExecute.once("value");
    console.log(dbKey + ": ", snapshot.val())

    if (snapshot.val()) {
        let last_execute_time = snapshot
            .val()
            .execute_time + (parseInt(item_execute_time) * 60 * 1000);
        //console.log(last_execute_time) console.log(Date.now())
        if (last_execute_time < Date.now() || last_execute_time) {
            //executeFunctionToLoad(urlRequest, dbKey)
            urlsToLoad.push({url, dbKey})
        } else {
            console.log("CAN'T EXECUTE NOW")
        }
    } else {
        urlsToLoad.push({url, dbKey})
    }
    return urlsToLoad;
}

async function loadPreviewsFromUrl(input, cb) {
    try {
        let data = await grabity.grabIt(input.link);
        await input
            .itemRef
            .update({previews: data})
        console.log("loading previews: ", input.link)
        cb('loaded previews')
    } catch (ex) {

        console.log("error loading previews: ", input.link)
        cb('error loaded previews')
    }
}

function loadFeedsFromUrl(url, dbKey) {
    return new Promise < any > ((resolve) => {
        const previewArray = []
        let urlRequest = request({url, timeout: 2000})
        urlRequest.on('error', (error) => {
            console.log("ErrorloadFeedsFromUrl Complete:: ", dbKey)
            resolve(previewArray)
        });

        urlRequest.on('response', function (res) {
            const parser = new FeedMe();
            res.pipe(parser);

            parser.on('error', (error) => {
                console.log("ErrorloadFeedsFromUrl Complete:: ", dbKey)
                resolve(previewArray)
            });
            parser.on('end', async function end() {
                console.log("loadFeedsFromUrl Complete:: ", dbKey)
                resolve(previewArray)
            });
            parser.on('item', async(item) => {

                let uniqueKey = (999999999999999999999 + (Date.parse(item.pubdate) * -1)).toString();
                if (item.pubdate) {
                    uniqueKey = (999999999999999999999 + (Date.parse(item.pubdate) * -1)).toString();
                } else if (item.published) {
                    uniqueKey = (999999999999999999999 + (Date.parse(item.published) * -1)).toString();
                } else if (item.updated) {
                    uniqueKey = (999999999999999999999 + (Date.parse(item.updated) * -1)).toString();
                } else if (item['dc:date']) {
                    uniqueKey = (999999999999999999999 + (Date.parse(item['dc:date']) * -1)).toString();
                }

                let ref = db.ref(dbKey + uniqueKey + "/");
                let link = "";
                if (item.link && item.link.href) {
                    link = item.link.href
                } else {
                    link = item.link;
                }
                previewArray.push({
                    previewItemKey: dbKey + uniqueKey + "/",
                    link: link
                });
                await ref.set(item)
            });
        });
    });
}

export {feedsFuntion};
