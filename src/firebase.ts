import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
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

// reCAPTCHA site keys are public by design; this key is restricted to the
// yeh0429.github.io domain and registered for this Firebase web app in App Check.
const recaptchaSiteKey = "6LeKCSguAAAAAF-Pph7_E-4VCfPH623gOJJfHWs5";
export const aiAssistantReady = Boolean(recaptchaSiteKey);

export const app = initializeApp(firebaseConfig);
if (recaptchaSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

