import * as admin from 'firebase-admin';

admin.initializeApp({
    credential: admin.credential.cert(require("../service-account.json")),
    storageBucket: "weiserapp1.appspot.com",
    databaseURL: "https://weiserapp1.firebaseio.com"
});

export {admin} ;