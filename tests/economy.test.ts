import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRevenue } from "../src/lib/economy";
import { RULES } from "../src/lib/config";

test("splitRevenue takes the platform fee and gives the rest to the director", () => {
  const { net, fee } = splitRevenue(100);
  assert.equal(fee, Math.round(100 * RULES.PLATFORM_FEE));
  assert.equal(net + fee, 100, "net + fee always reconstructs gross");
});

test("splitRevenue handles a free (0 credit) ticket", () => {
  const { net, fee } = splitRevenue(0);
  assert.equal(net, 0);
  assert.equal(fee, 0);
});

test("splitRevenue never loses or invents credits for a range of prices", () => {
  for (let gross = 0; gross <= 50; gross++) {
    const { net, fee } = splitRevenue(gross);
    assert.equal(net + fee, gross, `conservation at gross=${gross}`);
    assert.ok(net >= 0 && fee >= 0, "no negative splits");
  }
});
