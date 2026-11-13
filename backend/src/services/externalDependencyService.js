import { randomUUID } from "node:crypto";

class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold ?? 3;
        this.resetTimeoutMs = options.resetTimeoutMs ?? 5000;
        this.state = "CLOSED";
        this.failureCount = 0;
        this.lastFailureTime = null;
    }

    canExecute() {
        if (this.state === "CLOSED") return true;

        if (this.state === "OPEN") {
            const now = Date.now();
            if (now - this.lastFailureTime > this.resetTimeoutMs) {
                this.state = "HALF_OPEN";
                return true;
            }
            return false;
        }

        return true;
    }

    recordSuccess() {
        this.failureCount = 0;
        this.state = "CLOSED";
    }

    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.failureThreshold) {
            this.state = "OPEN";
        }
    }

    reset() {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.lastFailureTime = null;
    }
}

class ExternalDependencyService {
    constructor() {
        this.bureauCircuit = new CircuitBreaker("CreditBureauService", {
            failureThreshold: 3,
            resetTimeoutMs: 5000
        });
    }

    async executeWithRetry(operation, options = {}) {
        const maxRetries = options.maxRetries ?? 3;
        const initialDelayMs = options.initialDelayMs ?? 50;
        const backoffFactor = options.backoffFactor ?? 2;

        let attempt = 0;
        let lastError;

        while (attempt <= maxRetries) {
            try {
                const startTime = Date.now();
                const result = await operation(attempt);
                const elapsedMs = Date.now() - startTime;
                return {
                    success: true,
                    data: result,
                    retriesAttempted: attempt,
                    elapsedMs
                };
            } catch (err) {
                lastError = err;
                attempt++;
                if (attempt > maxRetries) break;
                const delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1) + Math.random() * 30;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return {
            success: false,
            error: lastError?.message || "External dependency failed after retries",
            retriesAttempted: attempt - 1
        };
    }

    async checkCreditAndFraud(applicantData, options = {}) {
        const {
            simulateFailure = false,
            failAttempts = 0
        } = options;

        const isExplicitFailure =
            simulateFailure ||
            applicantData.email?.includes("failure.simulate") ||
            applicantData.applicantName?.toLowerCase().includes("simulate fail");

        if (!this.bureauCircuit.canExecute() && !isExplicitFailure) {
            return {
                success: false,
                error: `Circuit Breaker [${this.bureauCircuit.name}] is OPEN. Failing fast.`,
                retriesAttempted: 0,
                circuitState: "OPEN"
            };
        }

        const operation = async (currentAttempt) => {
            await new Promise(res => setTimeout(res, 25));

            if (failAttempts > 0 && currentAttempt < failAttempts) {
                throw new Error(`Credit Bureau timeout on attempt ${currentAttempt + 1}`);
            }

            if (isExplicitFailure) {
                throw new Error("Credit Bureau Service 503: External Dependency Unavailable (Simulated Failure)");
            }

            const creditScore = applicantData.creditScore ?? 650;
            const verifiedCreditScore = Math.max(300, Math.min(850, creditScore + Math.floor(Math.random() * 11) - 5));

            let fraudRiskScore = 15;
            if (applicantData.income < 10000 && applicantData.loanAmount > 500000) {
                fraudRiskScore += 50;
            }
            if (creditScore < 500) {
                fraudRiskScore += 25;
            }

            return {
                bureauReferenceId: `BUR-${randomUUID().substring(0, 8)}`,
                verifiedCreditScore,
                fraudRiskScore,
                activeDefaults: creditScore < 550 ? 1 : 0,
                kycVerified: true,
                checkedAt: new Date().toISOString(),
                circuitBreakerState: this.bureauCircuit.state
            };
        };

        const result = await this.executeWithRetry(operation, {
            maxRetries: options.maxRetries ?? 2,
            initialDelayMs: 40,
            backoffFactor: 2
        });

        if (result.success) {
            this.bureauCircuit.recordSuccess();
        } else if (!isExplicitFailure) {
            this.bureauCircuit.recordFailure();
        }

        return result;
    }
}

export const externalDependencyService = new ExternalDependencyService();
export default externalDependencyService;
