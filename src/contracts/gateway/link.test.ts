import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAddress } from "./address.ts";
import { type Link, readLink, writeLink } from "./link.ts";

test("a link is read as it was written, with an IPv4 address, an IPv6 address, a host name and a name that needs escaping", () => {
  const links: Link[] = [
    { name: "crab", address: { host: "100.101.102.103", port: 7447 }, code: "K7Q2-9FXD" },
    { name: "crab", address: { host: "fd7a:115c:a1e0::1", port: 7447 }, code: "K7Q2-9FXD" },
    { name: "crab", address: { host: "::1", port: 65_535 }, code: "K7Q2-9FXD" },
    { name: "crab", address: { host: "gateway.example.net", port: 1 }, code: "K7Q2-9FXD" },
    { name: "a name/with @ odd things", address: { host: "127.0.0.1", port: 80 }, code: "K7Q2-9FXD" },
  ];
  for (const link of links) assert.deepEqual(readLink(writeLink(link)), link, writeLink(link));

  assert.equal(writeLink(links[0] as Link), "shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD");
  assert.equal(writeLink(links[1] as Link), "shrimpy://crab@[fd7a:115c:a1e0::1]:7447/K7Q2-9FXD", "an IPv6 address is in brackets");
  assert.equal(formatAddress({ host: "::1", port: 7447 }), "[::1]:7447");
  assert.deepEqual(readLink("  shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD\n"), links[0], "as it is pasted, with spaces around it");
});

test("text that is not a link is an error that says what a link looks like", () => {
  const wrong = [
    "",
    "crab@100.101.102.103:7447/K7Q2-9FXD",
    "https://crab@100.101.102.103:7447/K7Q2-9FXD",
    "shrimpy://100.101.102.103:7447/K7Q2-9FXD",
    "shrimpy://crab@100.101.102.103/K7Q2-9FXD",
    "shrimpy://crab@100.101.102.103:7447",
    "shrimpy://crab@100.101.102.103:0/K7Q2-9FXD",
    "shrimpy://crab@100.101.102.103:65536/K7Q2-9FXD",
    "shrimpy://crab@::1:7447/K7Q2-9FXD",
    "shrimpy://crab@[not-an-address]:7447/K7Q2-9FXD",
    "shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD/more",
    "shrimpy://%E0%A4%A@100.101.102.103:7447/K7Q2-9FXD",
  ];
  for (const text of wrong) assert.throws(() => readLink(text), /is not an invitation link.*shrimpy:\/\/crab@100\.101\.102\.103:7447\/K7Q2-9FXD/, text);
});
