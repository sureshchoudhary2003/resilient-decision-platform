import WorkflowConfig from "../models/WorkflowConfig.js";
import Application from "../models/Application.js";
import AuditLog from "../models/AuditLog.js";
import ruleEngine from "./ruleEngine.js";
import externalDependencyService from "./externalDependencyService.js";
import stateMachine, { ApplicationStatus } from "./stateMachine.js";

const DEFAULT_WORKFLOW = {
    name: "Standard Loan Decision Workflow",
    useCase: "LOAN_APPROVAL",
    version: 1,
    active: true,
    stages: [
        { name: "Schema Validation", type: "VALIDATION", order: 1, enabled: true },
        { name: "External Credit & Fraud Enrichment", type: "ENRICHMENT", order: 2, enabled: true },
        { name: "Rules Evaluation Engine", type: "EVALUATION", order: 3, enabled: true },
        { name: "Decision & State Transition", type: "FINALIZATION", order: 4, enabled: true }
    ],
    rules: [
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
    ]
};

class WorkflowService {
    async seedDefaultWorkflow() {
        const existing = await WorkflowConfig.findOne({ useCase: "LOAN_APPROVAL", active: true });
        if (!existing) {
            return await WorkflowConfig.create(DEFAULT_WORKFLOW);
        }
        return existing;
    }

    async getActiveWorkflow(useCase = "LOAN_APPROVAL") {
        let config = await WorkflowConfig.findOne({ useCase, active: true }).sort({ version: -1 });
        if (!config) {
            config = await this.seedDefaultWorkflow();
        }
        return config;
    }

    async processApplication(applicationId, options = {}) {
        const application = await Application.findOne({ applicationId });
        if (!application) {
            throw new Error(`Application ${applicationId} not found`);
        }

        const workflow = await this.getActiveWorkflow(application.useCase || "LOAN_APPROVAL");

        stateMachine.transition(application, ApplicationStatus.PROCESSING, {
            reason: "Workflow execution pipeline initiated",
            performedBy: "workflow_orchestrator"
        });
        await application.save();

        await AuditLog.create({
            applicationId,
            event: "WORKFLOW_EXECUTION_STARTED",
            details: {
                workflowName: workflow.name,
                workflowVersion: workflow.version,
                stages: workflow.stages.map(s => s.name)
            }
        });

        const bureauResult = await externalDependencyService.checkCreditAndFraud(
            application.toObject(),
            options
        );

        if (!bureauResult.success) {
            const failureReason = `External dependency failure: ${bureauResult.error}`;

            stateMachine.transition(application, ApplicationStatus.FAILED, {
                reason: failureReason,
                performedBy: "external_enrichment_stage",
                decision: null,
                decisionReason: failureReason
            });
            await application.save();

            await AuditLog.create({
                applicationId,
                event: "EXTERNAL_DEPENDENCY_FAILED",
                details: {
                    error: bureauResult.error,
                    retriesAttempted: bureauResult.retriesAttempted,
                    circuitState: bureauResult.circuitState
                }
            });

            return {
                application,
                success: false,
                error: bureauResult.error,
                retriesAttempted: bureauResult.retriesAttempted
            };
        }

        application.enrichmentData = bureauResult.data;

        await AuditLog.create({
            applicationId,
            event: "EXTERNAL_ENRICHMENT_COMPLETED",
            details: {
                bureauReferenceId: bureauResult.data.bureauReferenceId,
                verifiedCreditScore: bureauResult.data.verifiedCreditScore,
                fraudRiskScore: bureauResult.data.fraudRiskScore,
                retriesAttempted: bureauResult.retriesAttempted,
                latencyMs: bureauResult.elapsedMs
            }
        });

        const evaluationContext = {
            ...application.toObject(),
            enrichmentData: bureauResult.data
        };

        const evalResult = ruleEngine.evaluate(workflow.rules, evaluationContext);

        application.ruleTrace = evalResult.ruleTrace;
        application.workflowVersion = workflow.version;

        stateMachine.transition(application, evalResult.status, {
            reason: evalResult.decisionReason,
            decision: evalResult.decision,
            decisionReason: evalResult.decisionReason,
            performedBy: "rule_engine"
        });

        await application.save();

        await AuditLog.create({
            applicationId,
            event: "DECISION_FINALIZED",
            details: {
                decision: evalResult.decision,
                status: evalResult.status,
                decisionReason: evalResult.decisionReason,
                rulesEvaluated: evalResult.rulesCount,
                passedCount: evalResult.passedCount,
                failedCount: evalResult.failedCount,
                workflowVersion: workflow.version
            },
            ruleTrace: evalResult.ruleTrace
        });

        return {
            application,
            success: true,
            decision: evalResult.decision,
            status: evalResult.status,
            decisionReason: evalResult.decisionReason,
            ruleTrace: evalResult.ruleTrace,
            enrichmentData: bureauResult.data
        };
    }

    async reviewApplication(applicationId, { decision, reviewer = "system_underwriter", notes = "" }) {
        const application = await Application.findOne({ applicationId });
        if (!application) {
            throw new Error(`Application ${applicationId} not found`);
        }

        const normalizedDecision = decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : decision;

        if (!["APPROVED", "REJECTED"].includes(normalizedDecision)) {
            throw new Error("Decision must be either 'APPROVED' or 'REJECTED'");
        }

        const reason = `Manual Review: ${notes || "Decision overridden by reviewer " + reviewer}`;

        stateMachine.transition(application, normalizedDecision, {
            reason,
            decision: normalizedDecision,
            decisionReason: reason,
            performedBy: reviewer
        });

        await application.save();

        await AuditLog.create({
            applicationId,
            event: "MANUAL_REVIEW_RESOLVED",
            details: {
                reviewer,
                decision: normalizedDecision,
                notes
            }
        });

        return application;
    }
}

export const workflowService = new WorkflowService();
export default workflowService;
