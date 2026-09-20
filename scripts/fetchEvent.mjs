import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyA0ubEbHoYbfCSjfNxHUkt_fr_6WMb3t5Y",
  projectId: "pvgc-league",
});
const db = getFirestore(app);

const snap = await getDoc(doc(db, "weekends", "pocono-2026"));
console.log(JSON.stringify(snap.data(), null, 2));
process.exit(0);
