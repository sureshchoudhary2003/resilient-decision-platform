import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ruleEngine from "../src/services/ruleEngine.js";
import externalDependencyService from "../src/services/externalDependencyService.js";

const sampleRules = [
    {
        name: "Minimum Income Threshold",
        category: "MANDATORY",
        field: "income",
        operator: "gte",
        value: 20000,
        outcome: "REJECT",
        priority: 1,
        failureReason: "Income below 20000",
        passReason: "Income verified"
    },
    {
        name: "Hard Reject Credit Score",
        category: "THRESHOLD",
        field: "creditScore",
        operator: "gte",
        value: 600,
        outcome: "REJECT",
        priority: 2,
        failureReason: "Credit score below 600",
        passReason: "Credit score acceptable"
    },
    {
        name: "Auto-Approve Credit Score Tier",
        category: "THRESHOLD",
        field: "creditScore",
        operator: "gte",
        value: 720,
        outcome: "MANUAL_REVIEW",
        priority: 3,
        failureReason: "Credit score requires manual review",
        passReason: "Credit score in prime tier"
    },
    {
        name: "Loan-To-Income Safety Ratio",
        category: "BRANCHING",
        field: "loanToIncomeRatio",
        operator: "lte",
        value: 5.0,
        outcome: "MANUAL_REVIEW",
        priority: 4,
        failureReason: "Loan-to-income ratio exceeds 5x",
        passReason: "Loan-to-income ratio acceptable"
    }
];

describe("Rule Evaluation Engine Tests", () => {
    it("Scenario 1: Happy Path - Prime applicant auto-approved", () => {
        const applicant = {
            applicantName: "Aman Gupta",
            income: 120000,
            creditScore: 780,
            loanAmount: 200000
        };

        const result = ruleEngine.evaluate(sampleRules, applicant);

        assert.equal(result.decision, "APPROVED");
        assert.equal(result.status, "APPROVED");
        assert.equal(result.failedCount, 0);
        assert.equal(result.passedCount, 4);
        assert.ok(result.ruleTrace.length === 4);
    });

    it("Scenario 2: Mandatory failure - Low income triggers immediate REJECT", () => {
        const applicant = {
            applicantName: "Rahul Sharma",
            income: 15000,
            creditScore: 750,
            loanAmount: 50000
        };

        const result = ruleEngine.evaluate(sampleRules, applicant);

        assert.equal(result.decision, "REJECTED");
        assert.equal(result.status, "REJECTED");
        assert.match(result.decisionReason, /Income below 20000/);
        
        const incomeTrace = result.ruleTrace.find(r => r.field === "income");
        assert.equal(incomeTrace.passed, false);
    });

    it("Scenario 3: Threshold check - Low credit score triggers REJECT", () => {
        const applicant = {
            applicantName: "Priya Singh",
            income: 80000,
            creditScore: 550,
            loanAmount: 100000
        };

        const result = ruleEngine.evaluate(sampleRules, applicant);

        assert.equal(result.decision, "REJECTED");
        assert.match(result.decisionReason, /Credit score below 600/);
    });

    it("Scenario 4: Conditional branching - Moderate credit score triggers MANUAL_REVIEW", () => {
        const applicant = {
            applicantName: "Vikram Mehta",
            income: 90000,
            creditScore: 680,
            loanAmount: 150000
        };

        const result = ruleEngine.evaluate(sampleRules, applicant);

        assert.equal(result.decision, "MANUAL_REVIEW");
        assert.equal(result.status, "MANUAL_REVIEW");
        assert.match(result.decisionReason, /manual review/);
    });

    it("Scenario 5: High Loan-To-Income ratio triggers MANUAL_REVIEW", () => {
        const applicant = {
            applicantName: "Sneha Patel",
            income: 50000,
            creditScore: 740,
            loanAmount: 350000
        };

        const result = ruleEngine.evaluate(sampleRules, applicant);

        assert.equal(result.decision, "MANUAL_REVIEW");
        const ltiTrace = result.ruleTrace.find(r => r.field === "loanToIncomeRatio");
        assert.equal(ltiTrace.passed, false);
        assert.equal(ltiTrace.actualValue, 7);
    });

    it("Scenario 6: Dynamic Rule Modification on-the-fly", () => {
        const updatedRules = sampleRules.map(r => {
            if (r.name === "Auto-Approve Credit Score Tier") {
                return { ...r, value: 750 };
            }
            return r;
        });

        const applicant = {
            applicantName: "Test Applicant",
            income: 100000,
            creditScore: 730,
            loanAmount: 100000
        };

        const originalResult = ruleEngine.evaluate(sampleRules, applicant);
        assert.equal(originalResult.decision, "APPROVED");

        const newResult = ruleEngine.evaluate(updatedRules, applicant);
        assert.equal(newResult.decision, "MANUAL_REVIEW");
    });
});

describe("External Dependency & Resilience Tests", () => {
    it("Transient failure recovery via exponential backoff retries", async () => {
        const result = await externalDependencyService.checkCreditAndFraud(
            { applicantName: "Retry Test", creditScore: 720, income: 80000, loanAmount: 100000 },
            { failAttempts: 2, maxRetries: 3 }
        );

        assert.equal(result.success, true);
        assert.equal(result.retriesAttempted, 2);
        assert.ok(result.data.bureauReferenceId);
    });

    it("Handles persistent external service failure gracefully", async () => {
        const result = await externalDependencyService.checkCreditAndFraud(
            { applicantName: "Fail Test", creditScore: 720, income: 80000, loanAmount: 100000 },
            { simulateFailure: true, maxRetries: 1 }
        );

        assert.equal(result.success, false);
        assert.match(result.error, /External Dependency Unavailable/);
    });
});
