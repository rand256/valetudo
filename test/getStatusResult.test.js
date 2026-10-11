"use strict";

const assert = require("assert");
const getStatusResult = require("../lib/miio/getStatusResult");

const valid = {state: 5, battery: 96, error_code: 0};
assert.strictEqual(getStatusResult({result: [valid]}), valid);
assert.strictEqual(getStatusResult({result: [valid, {other: true}]}), valid);

for (const input of [
    undefined, null, {}, {error: {code: -1}},
    {result: null}, {result: "failed"}, {result: []},
    {result: [null]}, {result: [0]}, {result: ["ok"]}, {result: [[]]}
]) {
    assert.strictEqual(getStatusResult(input), null, `Should reject ${JSON.stringify(input)}`);
}
console.log("getStatusResult: all assertions passed");
