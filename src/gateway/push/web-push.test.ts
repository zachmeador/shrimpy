import assert from "node:assert/strict";
import { createECDH, createPublicKey, generateKeyPairSync, type KeyObject, verify } from "node:crypto";
import { test } from "node:test";
import { readPushMessage } from "../../contracts/gateway/testing/index.ts";
import { encrypt, encryptWith, publicKeyOf, tokenFor, vapid } from "./web-push.ts";

/** The base64url the RFCs print, with the line breaks and spaces they add taken out. */
const joined = (text: string): string => text.replace(/\s+/g, "");

/** RFC 8291, section 5 and appendix A. */
const RFC_8291 = {
  plaintext: "When I grow up, I want to be a watermelon",
  senderPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  senderPublic: joined("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"),
  receiverPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  receiverPublic: joined("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  message: joined(`
    DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
    mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
    pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`),
};

/** RFC 8292, section 2.4. */
const RFC_8292 = {
  token: joined(`
    eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3
    B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1ha
    Wx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_H
    LGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA`),
  key: joined("BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dR uU_RCPCfA5aq9ojSwk5Y2EmClBPs"),
  jwk: { kty: "EC", crv: "P-256", x: "DUfHPKLVFQzVvnCPGyfucbECzPDa7rWbXriLcysAjEc", y: "F6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs" },
  claims: { aud: "https://push.example.net", exp: 1453523768, sub: "mailto:push@example.com" },
};

/** Whether `token` is signed as ES256 asks, by the key whose public half is `key`. */
function signedBy(token: string, key: KeyObject): boolean {
  const [header = "", claims = "", signature = ""] = token.split(".");
  return verify("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
}

test("a message is encrypted as RFC 8291's example is, and the browser that stands in for one reads it back", () => {
  const sender = createECDH("prime256v1");
  sender.setPrivateKey(Buffer.from(RFC_8291.senderPrivate, "base64url"));
  assert.equal(sender.getPublicKey().toString("base64url"), RFC_8291.senderPublic);
  const place = { endpoint: "https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV", p256dh: RFC_8291.receiverPublic, auth: RFC_8291.auth };

  const sealed = encryptWith(Buffer.from(RFC_8291.plaintext), place, Buffer.from(RFC_8291.salt, "base64url"), sender);

  assert.equal(sealed.toString("base64url"), RFC_8291.message);
  const read = readPushMessage(Buffer.from(RFC_8291.message, "base64url"), RFC_8291.receiverPrivate, RFC_8291.auth);
  assert.equal(read.toString("utf8"), RFC_8291.plaintext, "the test's browser reads the standard's message");
  const fresh = encrypt(Buffer.from(RFC_8291.plaintext), place);
  assert.notEqual(fresh.toString("base64url"), RFC_8291.message, "each message has a key and a salt of its own");
  assert.equal(readPushMessage(fresh, RFC_8291.receiverPrivate, RFC_8291.auth).toString("utf8"), RFC_8291.plaintext);
});

test("a token is written and signed as RFC 8292's example is, with its key written as the example's is", () => {
  const exampleKey = createPublicKey({ key: RFC_8292.jwk, format: "jwk" });
  assert.equal(publicKeyOf(exampleKey), RFC_8292.key);
  assert.ok(signedBy(RFC_8292.token, exampleKey), "the standard's own token checks out the way ours are checked");
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

  const token = tokenFor(RFC_8292.claims, privateKey);

  const [header, claims] = token.split(".");
  assert.equal(`${header ?? ""}.${claims ?? ""}`, RFC_8292.token.split(".").slice(0, 2).join("."));
  assert.ok(signedBy(token, publicKey));
  const now = 1_700_000_000_000;
  const said = /^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/.exec(vapid("https://push.example.net/p/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV", privateKey, RFC_8292.claims.sub, now));
  assert.ok(said !== null, "the header says vapid, with the token and the key that signed it");
  const [, sent = "", key = ""] = said;
  assert.equal(key, publicKeyOf(publicKey));
  assert.ok(signedBy(sent, publicKey));
  const sentClaims = JSON.parse(Buffer.from(sent.split(".")[1] ?? "", "base64url").toString("utf8")) as { aud: string; exp: number; sub: string };
  assert.equal(sentClaims.aud, "https://push.example.net", "the token is for the push service's origin");
  assert.ok(sentClaims.exp > now / 1000 && sentClaims.exp <= now / 1000 + 24 * 60 * 60, "and good for no more than a day");
  assert.equal(sentClaims.sub, RFC_8292.claims.sub);
});
