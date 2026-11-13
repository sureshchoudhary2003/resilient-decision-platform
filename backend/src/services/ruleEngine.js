class RuleEngine {
    resolveFieldValue(field, data) {
        if (!field) return undefined;

        if (field === "loanToIncomeRatio" || field === "debtToIncomeRatio") {
            const income = Number(data.income) || 0;
            const loan = Number(data.loanAmount) || 0;
            if (income <= 0) return 999;
            return Number((loan / income).toFixed(2));
        }

        if (field === "verifiedCreditScore") {
            return data.enrichmentData?.verifiedCreditScore ?? data.creditScore;
        }

        if (field === "fraudRiskScore") {
            return data.enrichmentData?.fraudRiskScore ?? 0;
        }

        if (field === "activeDefaults") {
            return data.enrichmentData?.activeDefaults ?? 0;
        }

        const parts = field.split(".");
        let current = data;
        for (const part of parts) {
            if (current == null) return undefined;
            current = current[part];
        }
        return current;
    }

    evaluateOperator(operator, actual, expected) {
        if (operator === "exists") {
            return actual !== undefined && actual !== null && actual !== "";
        }

        if (actual === undefined || actual === null) {
            return false;
        }

        switch (operator) {
            case "eq":
                return actual === expected || String(actual) === String(expected);
            case "neq":
                return actual !== expected && String(actual) !== String(expected);
            case "gt":
                return Number(actual) > Number(expected);
            case "gte":
                return Number(actual) >= Number(expected);
            case "lt":
                return Number(actual) < Number(expected);
            case "lte":
                return Number(actual) <= Number(expected);
            case "in":
                return Array.isArray(expected) && expected.includes(actual);
            case "nin":
                return Array.isArray(expected) && !expected.includes(actual);
            case "between":
                if (Array.isArray(expected) && expected.length === 2) {
                    const num = Number(actual);
                    return num >= Number(expected[0]) && num <= Number(expected[1]);
                }
                return false;
            case "contains":
                if (typeof actual === "string") return actual.includes(String(expected));
                if (Array.isArray(actual)) return actual.includes(expected);
                return false;
            case "regex":
                try {
                    return new RegExp(expected, "i").test(String(actual));
                } catch {
                    return false;
                }
            default:
                return false;
        }
    }

    formatReason(rule, actual, passed) {
        if (passed) {
            return rule.passReason ||
                `Rule '${rule.name}' passed: ${rule.field} (${actual}) satisfies condition [${rule.operator} ${JSON.stringify(rule.value)}]`;
        }
        return rule.failureReason ||
            `Rule '${rule.name}' failed: ${rule.field} (${actual}) does not satisfy condition [${rule.operator} ${JSON.stringify(rule.value)}]`;
    }

    evaluate(rules = [], applicationData = {}) {
        const sortedRules = [...rules]
            .filter(r => r.enabled !== false)
            .sort((a, b) => (a.priority || 1) - (b.priority || 1));

        const ruleTrace = [];
        const rejectionReasons = [];
        const reviewReasons = [];

        for (const rule of sortedRules) {
            const actualValue = this.resolveFieldValue(rule.field, applicationData);
            const conditionMet = this.evaluateOperator(rule.operator, actualValue, rule.value);
            const isTrigger = rule.conditionType === "TRIGGER";
            const passed = isTrigger ? !conditionMet : conditionMet;
            const explanation = this.formatReason(rule, actualValue, passed);

            ruleTrace.push({
                ruleName: rule.name,
                category: rule.category || "THRESHOLD",
                field: rule.field,
                operator: rule.operator,
                expectedValue: rule.value,
                actualValue,
                passed,
                outcome: rule.outcome || "CONTINUE",
                reason: explanation,
                priority: rule.priority || 1
            });

            if (!passed) {
                if (rule.outcome === "REJECT") {
                    rejectionReasons.push(explanation);
                } else if (rule.outcome === "MANUAL_REVIEW") {
                    reviewReasons.push(explanation);
                }
            }
        }

        let finalDecision = "APPROVED";
        let finalStatus = "APPROVED";
        let decisionReason = "All mandatory eligibility criteria and risk threshold checks passed successfully.";

        if (rejectionReasons.length > 0) {
            finalDecision = "REJECTED";
            finalStatus = "REJECTED";
            decisionReason = `Application rejected due to ${rejectionReasons.length} failed check(s): ${rejectionReasons.join("; ")}`;
        } else if (reviewReasons.length > 0) {
            finalDecision = "MANUAL_REVIEW";
            finalStatus = "MANUAL_REVIEW";
            decisionReason = `Application flagged for manual review: ${reviewReasons.join("; ")}`;
        }

        return {
            decision: finalDecision,
            status: finalStatus,
            decisionReason,
            ruleTrace,
            rulesCount: sortedRules.length,
            passedCount: ruleTrace.filter(t => t.passed).length,
            failedCount: ruleTrace.filter(t => !t.passed).length,
            evaluatedAt: new Date().toISOString()
        };
    }
}

export const ruleEngine = new RuleEngine();
export default ruleEngine;
