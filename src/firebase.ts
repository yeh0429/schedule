import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase web configuration is public by design. Access to schedule data is
// enforced by Firestore Security Rules and each user's authenticated UID.
const firebaseConfig = {
  apiKey: "AIzaSyD81wZdZtBi52rgJuSTEey7_8HvX2HL-Ao",
  authDomain: "schedule-yeh0429.firebaseapp.com",
  projectId: "schedule-yeh0429",
  storageBucket: "schedule-yeh0429.firebasestorage.app",
  messagingSenderId: "913120661338",
  appId: "1:913120661338:web:824ca43c908dd45cc72d63",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

