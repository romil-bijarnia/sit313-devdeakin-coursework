import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const requiredConfig = {
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId
};
const missingConfig = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([name]) => name);

export const isFirebaseConfigured = missingConfig.length === 0;
export const isFirebaseStorageConfigured =
  isFirebaseConfigured && Boolean(firebaseConfig.storageBucket);

let services = null;

export function getFirebaseServices() {
  if (!isFirebaseConfigured) {
    const error = new Error(`Missing Firebase configuration: ${missingConfig.join(', ')}`);
    error.code = 'firebase/config-missing';
    throw error;
  }

  if (!services) {
    const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    services = Object.freeze({
      firebaseApp,
      auth: getAuth(firebaseApp),
      db: getFirestore(firebaseApp),
      storage: isFirebaseStorageConfigured ? getStorage(firebaseApp) : null
    });
  }

  return services;
}

export function getPersistenceMode() {
  return isFirebaseConfigured ? 'firebase' : 'local-demo';
}
