import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ruleEngine from "../src/services/ruleEngine.js";

const productionWorkflowRules = [
    {
        name: "Minimum Income Threshold",
        category: "MANDATORY",
        field: "income",
        operator: "gte",
        value: 20000,
        outcome: "REJECT",
        priority: 1,
        enabled: true,
        failureReason: "Minimum income requirement of 20,000 not met",
        passReason: "Applicant income meets minimum threshold"
    },
    {
        name: "Maximum Loan Amount Limit",
        category: "MANDATORY",
        field: "loanAmount",
        operator: "lte",
        value: 5000000,
        outcome: "REJECT",
        priority: 2,
        enabled: true,
        failureReason: "Requested loan amount exceeds platform ceiling of 5,000,000",
        passReason: "Loan amount is within allowable limits"
    },
    {
        name: "Hard Reject Credit Score",
        category: "THRESHOLD",
        field: "creditScore",
        operator: "gte",
        value: 600,
        outcome: "REJECT",
        priority: 3,
        enabled: true,
        failureReason: "Credit score below minimum eligible threshold of 600",
        passReason: "Credit score satisfies minimum eligibility"
    },
    {
        name: "Auto-Approve Credit Score Tier",
        category: "THRESHOLD",
        field: "creditScore",
        operator: "gte",
        value: 720,
        outcome: "MANUAL_REVIEW",
        priority: 4,
        enabled: true,
        failureReason: "Credit score between 600 and 719 requires manual underwriter review",
        passReason: "Credit score is in prime auto-approval tier (>= 720)"
    },
    {
        name: "Loan-To-Income Safety Ratio",
        category: "BRANCHING",
        field: "loanToIncomeRatio",
        operator: "lte",
        value: 5.0,
        outcome: "MANUAL_REVIEW",
        priority: 5,
        enabled: true,
        failureReason: "Loan-to-income ratio exceeds 5x, requiring manual underwriter risk assessment",
        passReason: "Loan-to-income ratio is within safe automated boundaries (<= 5x)"
    },
    {
        name: "Zero Active Defaults Check",
        category: "MANDATORY",
        field: "activeDefaults",
        operator: "eq",
        value: 0,
        outcome: "REJECT",
        priority: 6,
        enabled: true,
        failureReason: "Credit bureau reported active delinquent accounts",
        passReason: "No active default accounts found on credit bureau"
    },
    {
        name: "Bureau Fraud Risk Ceiling",
        category: "THRESHOLD",
        field: "fraudRiskScore",
        operator: "lte",
        value: 50,
        outcome: "REJECT",
        priority: 7,
        enabled: true,
        failureReason: "External fraud risk score exceeded acceptable threshold (score > 50)",
        passReason: "Fraud risk score is within acceptable safe limit (<= 50)"
    }
];

describe("End-to-End Decision Workflow Execution", () => {
    it("Evaluates clean applicant as APPROVED with full audit trace", () => {
        const applicant = {
            applicantName: "Aditya Verma",
            income: 150000,
            creditScore: 790,
            loanAmount: 300000,
            enrichmentData: {
                activeDefaults: 0,
                fraudRiskScore: 12,
                verifiedCreditScore: 785
            }
        };

        const result = ruleEngine.evaluate(productionWorkflowRules, applicant);

        assert.equal(result.decision, "APPROVED");
        assert.equal(result.status, "APPROVED");
        assert.equal(result.failedCount, 0);
        assert.equal(result.rulesCount, 7);
        assert.match(result.decisionReason, /passed successfully/i);
    });

    it("Catches external bureau active defaults and REJECTS", () => {
        const applicant = {
            applicantName: "Kunal Roy",
            income: 90000,
            creditScore: 730,
            loanAmount: 200000,
            enrichmentData: {
                activeDefaults: 2,
                fraudRiskScore: 10
            }
        };

        const result = ruleEngine.evaluate(productionWorkflowRules, applicant);

        assert.equal(result.decision, "REJECTED");
        const defaultTrace = result.ruleTrace.find(r => r.field === "activeDefaults");
        assert.equal(defaultTrace.passed, false);
        assert.match(result.decisionReason, /active delinquent accounts/i);
    });

    it("Catches elevated fraud risk score and REJECTS", () => {
        const applicant = {
            applicantName: "Fraud Alert Test",
            income: 80000,
            creditScore: 740,
            loanAmount: 100000,
            enrichmentData: {
                activeDefaults: 0,
                fraudRiskScore: 78
            }
        };

        const result = ruleEngine.evaluate(productionWorkflowRules, applicant);

        assert.equal(result.decision, "REJECTED");
        const fraudTrace = result.ruleTrace.find(r => r.field === "fraudRiskScore");
        assert.equal(fraudTrace.passed, false);
    });

    it("Flags borderline applicant for MANUAL_REVIEW when credit is 650", () => {
        const applicant = {
            applicantName: "Sunil Mehra",
            income: 70000,
            creditScore: 650,
            loanAmount: 150000,
            enrichmentData: {
                activeDefaults: 0,
                fraudRiskScore: 15
            }
        };

        const result = ruleEngine.evaluate(productionWorkflowRules, applicant);

        assert.equal(result.decision, "MANUAL_REVIEW");
        assert.equal(result.status, "MANUAL_REVIEW");
        const tierTrace = result.ruleTrace.find(r => r.ruleName === "Auto-Approve Credit Score Tier");
        assert.equal(tierTrace.passed, false);
    });

    it("Flags loan-to-income ratio violation for MANUAL_REVIEW", () => {
        const applicant = {
            applicantName: "Deepak Joshi",
            income: 40000,
            creditScore: 760,
            loanAmount: 280000,
            enrichmentData: {
                activeDefaults: 0,
                fraudRiskScore: 20
            }
        };

        const result = ruleEngine.evaluate(productionWorkflowRules, applicant);

        assert.equal(result.decision, "MANUAL_REVIEW");
        const ltiTrace = result.ruleTrace.find(r => r.field === "loanToIncomeRatio");
        assert.equal(ltiTrace.passed, false);
        assert.equal(ltiTrace.actualValue, 7);
    });
});
