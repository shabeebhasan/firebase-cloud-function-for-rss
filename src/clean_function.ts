import * as functions from 'firebase-functions';
import * as remoteConfig from '../js/remote-config';
import * as fs from "fs";
import * as path from "path";
import {admin} from "./admin";

const bucket = admin
    .storage()
    .bucket();
const db = admin.database();

const TEMP_DIRECTORY = path.resolve(__dirname, '../../tmp') + "/";
const CONFIG_FILE = TEMP_DIRECTORY + 'config.json';
const DELETE_LIMIT = 1000;

const feedCleanFunction = functions
    .https
    .onRequest((req, callback) => {

        remoteConfig
            .call('get', function () {
                let rawdata = fs.readFileSync(CONFIG_FILE);
                let jsonCofig = JSON.parse(rawdata.toString());
                let parameters = jsonCofig['parameters'];

                for (let key in parameters) {
                    let value = parameters[key].defaultValue.value;
                    let filename = key + "_" + value + ".json";
                    console.log("filename is " + filename);
                    let file = bucket.file('FeedSources/' + filename);
                    file
                        .download()
                        .then((data) => {
                            try {
                                //loading feeds data
                                let feedData = JSON.parse(data.toString())
                                for (let i = 0; i < feedData.length; i++) {
                                    firebaseReadData(feedData[i], key, value);
                                }

                            } catch (ex) {
                                console.log("error in feedData Loading:", ex);
                                console.log("error in feedData Loading:", filename);
                            }
                        })
                        .catch((ex) => {
                            console.log(filename, " not exitst..")
                        });
                }
            });
        callback.send(`CALLED`);
    });

function firebaseReadData(feedItem, category, version) {

    let dbKey = "";
    let url = "";
    let uniqueOperationId = "";
    let urlRequest = null;
    let item_execute_time = "";

    if (feedItem.execution_time !== "") {
        item_execute_time = feedItem.execution_time;
    }

    if (feedItem.multi_url !== "" && feedItem.multi_id !== "") {

        //working of non multi id feeds
        url = feedItem.multi_url;
        uniqueOperationId = feedItem.multi_id;
        let parent_name = feedItem.parent_name;
        dbKey = "/souceversion/" + category + "/" + parent_name.replace(/[^a-zA-Z0-9]/g, "") + "/" + uniqueOperationId.replace(/[^a-zA-Z0-9]/g, "") + ":" + version + "/";

    } else {
        //working of non multi id feeds
        url = feedItem.feeds_url;
        uniqueOperationId = feedItem.uniqueOperationId;
        dbKey = "/souceversion/" + category + "/" + uniqueOperationId.replace(/[^a-zA-Z0-9]/g, "") + ":" + version + "/";
    }
    let tableRef = db.ref(dbKey);
    tableRef.once("value", function (snapshot) {
        const count = snapshot.numChildren();
        console.log('firebaseReadData::  ' + dbKey, " " + count);
        if (count > DELETE_LIMIT) {
          let updates = {};
          const keys = Object.keys(snapshot.val());
          for(let i = DELETE_LIMIT; i < keys.length;i++){
            let k = keys[i];
            updates[k] = null;
          }
          console.log("DELETING KEYS:: " , Object.keys(updates).length);
          tableRef.update(updates).catch((err) => {
            console.log(err);
          });;
        }
    }).catch((err) => {
      console.log(err);
    });
}

export {feedCleanFunction};