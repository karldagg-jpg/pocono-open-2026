/**
 * Sign a script in as an organizer, by emailed link — no password.
 *
 * Changing a weekend's setup (locking rounds, archiving) is for organizers,
 * and the database checks. The script sends a link; copy it from the email,
 * paste it into the terminal, and it carries on as you.
 *
 *   POCONO_EMAIL=you@example.com node scripts/finalize-weekend.mjs pocono-2026
 */
import readline from "node:readline";
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";

export const CONTINUE_URL = "https://karldagg-jpg.github.io/pocono-open-2026/";

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

export async function signInAsOrganizer(auth, {
  email = process.env.POCONO_EMAIL,
  prompt = ask,
  log = console.log,
  send = sendSignInLinkToEmail,
  isLink = isSignInWithEmailLink,
  signIn = signInWithEmailLink,
} = {}) {
  if (auth.currentUser && !auth.currentUser.isAnonymous) return auth.currentUser;
  const address = email || (await prompt("Your organizer email: "));
  if (!address) throw new Error("No email given — can't sign in.");
  await send(auth, address, { url: CONTINUE_URL, handleCodeInApp: true });
  log(`\nA sign-in link is on its way to ${address}.`);
  log("Open the email, copy the link (don't tap it), and paste it here.\n");
  const link = await prompt("Link: ");
  if (!isLink(auth, link)) throw new Error("That isn't the sign-in link from the email.");
  const cred = await signIn(auth, address, link);
  log(`Signed in as ${cred.user.email}.\n`);
  return cred.user;
}
