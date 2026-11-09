import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { signInAsOrganizer, CONTINUE_URL } from "../scripts/signInAsOrganizer.mjs";

const LINK = "https://pvgc-league.firebaseapp.com/__/auth/action?mode=signIn&oobCode=abc";
function fakes() {
  const calls = [];
  return {
    calls,
    send: async (_a, email, settings) => calls.push(["send", email, settings]),
    isLink: (_a, l) => l === LINK,
    signIn: async (_a, email, link) => { calls.push(["signIn", email, link]); return { user: { email } }; },
  };
}
const answers = (...xs) => async () => xs.shift();

describe("signInAsOrganizer", () => {
  it("sends the link to the app's own address and signs in with the pasted one", async () => {
    const f = fakes();
    const user = await signInAsOrganizer({ currentUser: null }, { email: "karl@example.com", prompt: answers(LINK), log: () => {}, ...f });
    expect(user.email).toBe("karl@example.com");
    expect(f.calls[0]).toEqual(["send", "karl@example.com", { url: CONTINUE_URL, handleCodeInApp: true }]);
    expect(f.calls[1]).toEqual(["signIn", "karl@example.com", LINK]);
  });

  it("refuses a link that isn't the one from the email", async () => {
    await expect(signInAsOrganizer({ currentUser: null }, { email: "k@x.com", prompt: answers("nope"), log: () => {}, ...fakes() }))
      .rejects.toThrow("isn't the sign-in link");
  });

  it("finalize-weekend signs in before writing, and not for a dry run", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "scripts/finalize-weekend.mjs"), "utf8");
    expect(src).not.toMatch(/signInAnonymously/);
    expect(src).toMatch(/if \(!dryRun\) await signInAsOrganizer/);
  });
});
