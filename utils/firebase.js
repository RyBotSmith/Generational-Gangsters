// ─────────────────────────────────────────────
//  firebase.js  —  Initialise Firestore from env vars only.
//  Never import a serviceAccountKey.json file.
// ─────────────────────────────────────────────

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore }                  = require('firebase-admin/firestore');

function initFirebase() {
  if (getApps().length > 0) {
    // Already initialised (e.g. during hot-reload in dev)
    return getFirestore();
  }

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error(
      '[Firebase] Missing required env vars: ' +
      'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY'
    );
  }

  initializeApp({
    credential: cert({
      projectId:   FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // Railway/env stores newlines as literal \n — replace them
      privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });

  const db = getFirestore();
  console.log('[Firebase] Connected to project:', FIREBASE_PROJECT_ID);
  return db;
}

const db = initFirebase();
module.exports = { db };
