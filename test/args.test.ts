import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAddArgs, parseListArgs } from "../src/args.js";

test("parses add flags", () => {
    assert.deepEqual(
        parseAddArgs(["--payer", "Ali", "--amount", "25.5", "--category", "Dining", "--description", "Pizza"]),
        { payer: "Ali", amount: 25.5, category: "Dining", description: "Pizza" }
    );
});

test("defaults the description to empty", () => {
    assert.deepEqual(parseAddArgs(["--payer", "Ali", "--amount", "10", "--category", "Travel"]), {
        payer: "Ali",
        amount: 10,
        category: "Travel",
        description: "",
    });
});

test("trims payer and category", () => {
    assert.deepEqual(parseAddArgs(["--payer", "  Ali  ", "--amount", "10", "--category", " Dining "]), {
        payer: "Ali",
        amount: 10,
        category: "Dining",
        description: "",
    });
});

test("rejects a missing amount", () => {
    assert.throws(() => parseAddArgs(["--payer", "Ali", "--category", "Dining"]), /--amount is required/);
});

test("rejects a non-numeric amount", () => {
    assert.throws(
        () => parseAddArgs(["--payer", "Ali", "--amount", "lots", "--category", "Dining"]),
        /--amount must be a number/
    );
});

test("rejects zero and negative amounts", () => {
    assert.throws(() => parseAddArgs(["--payer", "Ali", "--amount", "0", "--category", "Dining"]), /greater than 0/);
    assert.throws(() => parseAddArgs(["--payer", "Ali", "--amount", "-5", "--category", "Dining"]), /greater than 0/);
});

test("rejects a flag without a value", () => {
    assert.throws(() => parseAddArgs(["--payer", "Ali", "--amount"]), /--amount requires a value/);
});

test("rejects unknown options in add", () => {
    assert.throws(
        () => parseAddArgs(["--payer", "Ali", "--amount", "10", "--category", "Dining", "--bogus"]),
        /Unknown option/
    );
});

test("rejects positional arguments in add", () => {
    assert.throws(
        () => parseAddArgs(["--payer", "Ali", "--amount", "10", "--category", "Dining", "extra"]),
        /Unexpected argument/
    );
});

test("parses an empty list", () => {
    assert.deepEqual(parseListArgs([]), { all: false });
});

test("parses list --limit", () => {
    assert.deepEqual(parseListArgs(["--limit", "5"]), { all: false, limit: 5 });
});

test("parses list --all", () => {
    assert.deepEqual(parseListArgs(["--all"]), { all: true });
});

test("rejects --all combined with --limit", () => {
    assert.throws(() => parseListArgs(["--all", "--limit", "5"]), /--all cannot be combined/);
});

test("rejects a non-positive limit", () => {
    assert.throws(() => parseListArgs(["--limit", "0"]), /positive integer/);
    assert.throws(() => parseListArgs(["--limit", "1.5"]), /positive integer/);
});
