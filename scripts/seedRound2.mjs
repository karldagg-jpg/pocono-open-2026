// One-shot: seed Round 2 course with Great Bear Golf Club Blue tee data.
import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA0ubEbHoYbfCSjfNxHUkt_fr_6WMb3t5Y",
  authDomain: "pvgc-league.firebaseapp.com",
  projectId: "pvgc-league",
  storageBucket: "pvgc-league.firebasestorage.app",
  messagingSenderId: "731595471102",
  appId: "1:731595471102:web:d4ad8bf15746bab7874daf",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

await signInAnonymously(auth);

await updateDoc(doc(db, "weekends", "pocono-2026"), {
  "courses.2": {
    name:   "Great Bear Golf Club",
    slope:  133,
    rating: 69.7,
    //          H1  H2  H3  H4  H5  H6  H7  H8  H9  H10 H11 H12 H13 H14 H15 H16 H17 H18
    par:  [4,  3,  4,  5,  4,  4,  3,  5,  4,  4,  3,  4,  3,  4,  5,  3,  4,  5],
    si:   [11, 9,  1,  5,  3,  15, 17, 7,  13, 8,  14, 2,  16, 10, 12, 18, 4,  6],
  },
});

console.log("✓ Round 2 — Great Bear Golf Club (Blue) saved to Firestore.");
process.exit(0);
