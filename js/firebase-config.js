// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC56buKWd2U8IRfKfBYYWjkS7rwhZogGok",
  authDomain: "expensify-55ed8.firebaseapp.com",
  projectId: "expensify-55ed8",
  storageBucket: "expensify-55ed8.firebasestorage.app",
  messagingSenderId: "499931843480",
  appId: "1:499931843480:web:c92f62ee596b5c015839ed"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
