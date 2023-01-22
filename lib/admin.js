"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
exports.admin = admin;
admin.initializeApp({
    credential: admin.credential.cert(require("../service-account.json")),
    storageBucket: "weiserapp1.appspot.com",
    databaseURL: "https://weiserapp1.firebaseio.com"
});
//# sourceMappingURL=admin.js.map