import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC8bUzmGsfMCuBHIuONhW7qOTb5vqQQOP0",
  authDomain: "bbvic-gestao-premium.firebaseapp.com",
  projectId: "bbvic-gestao-premium",
  storageBucket: "bbvic-gestao-premium.firebasestorage.app",
  messagingSenderId: "214158661970",
  appId: "1:214158661970:web:b7b9746296f5c35159c28b"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;