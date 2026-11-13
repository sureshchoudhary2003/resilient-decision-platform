import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

describe("Idempotency & Request Validation Logic Tests", () => {
    it("Computes consistent SHA-256 payload hash", () => {
        const payload1 = {
            applicantName: "Aman Gupta",
            email: "aman@example.com",
            income: 100000,
            creditScore: 750,
            loanAmount: 200000
        };

        const hash1 = createHash("sha256")
            .update(JSON.stringify(payload1))
            .digest("hex");

        const hash2 = createHash("sha256")
            .update(JSON.stringify(payload1))
            .digest("hex");

        assert.equal(hash1, hash2);
        assert.equal(hash1.length, 64);
    });

    it("Detects payload mismatch when idempotency key is reused with different data", () => {
        const payloadOriginal = {
            applicantName: "Aman Gupta",
            email: "aman@example.com",
            income: 100000,
            creditScore: 750,
            loanAmount: 200000
        };

        const payloadTampered = {
            ...payloadOriginal,
            loanAmount: 500000
        };

        const hashOriginal = createHash("sha256")
            .update(JSON.stringify(payloadOriginal))
            .digest("hex");

        const hashTampered = createHash("sha256")
            .update(JSON.stringify(payloadTampered))
            .digest("hex");

        assert.notEqual(hashOriginal, hashTampered);
    });

    it("Validates loan application schema boundary values", () => {
        const validateInput = (input) => {
            const errors = [];
            if (!input.applicantName || input.applicantName.trim().length < 2) {
                errors.push("Applicant name must be at least 2 characters");
            }
            if (!input.email || !input.email.includes("@")) {
                errors.push("Valid email required");
            }
            if (typeof input.income !== "number" || input.income < 0) {
                errors.push("Income must be non-negative");
            }
            if (typeof input.creditScore !== "number" || input.creditScore < 300 || input.creditScore > 850) {
                errors.push("Credit score must be between 300 and 850");
            }
            if (typeof input.loanAmount !== "number" || input.loanAmount <= 0) {
                errors.push("Loan amount must be greater than zero");
            }
            return errors;
        };

        const invalidApplicant = {
            applicantName: "A",
            email: "invalid-email",
            income: -500,
            creditScore: 900,
            loanAmount: 0
        };

        const errors = validateInput(invalidApplicant);
        assert.equal(errors.length, 5);

        const validApplicant = {
            applicantName: "Aman Gupta",
            email: "aman@example.com",
            income: 80000,
            creditScore: 750,
            loanAmount: 150000
        };
        const validErrors = validateInput(validApplicant);
        assert.equal(validErrors.length, 0);
    });
});
