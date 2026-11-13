export const ApplicationStatus = Object.freeze({
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    MANUAL_REVIEW: "MANUAL_REVIEW",
    FAILED: "FAILED"
});

export const TerminalStates = Object.freeze([
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED
]);

export const VALID_TRANSITIONS = Object.freeze({
    [ApplicationStatus.PENDING]: [
        ApplicationStatus.PROCESSING,
        ApplicationStatus.REJECTED
    ],
    [ApplicationStatus.PROCESSING]: [
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.MANUAL_REVIEW,
        ApplicationStatus.FAILED
    ],
    [ApplicationStatus.MANUAL_REVIEW]: [
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED
    ],
    [ApplicationStatus.FAILED]: [
        ApplicationStatus.PROCESSING,
        ApplicationStatus.REJECTED
    ],
    [ApplicationStatus.APPROVED]: [],
    [ApplicationStatus.REJECTED]: []
});

export class InvalidStateTransitionError extends Error {
    constructor(fromStatus, toStatus, reason) {
        super(`Illegal state transition from '${fromStatus}' to '${toStatus}'. ${reason || ""}`);
        this.name = "InvalidStateTransitionError";
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.statusCode = 400;
    }
}

class StateMachine {
    canTransition(fromStatus, toStatus) {
        const allowed = VALID_TRANSITIONS[fromStatus];
        if (!allowed) return false;
        return allowed.includes(toStatus);
    }

    validateTransition(fromStatus, toStatus, reason = "") {
        if (!this.canTransition(fromStatus, toStatus)) {
            const allowed = (VALID_TRANSITIONS[fromStatus] || []).join(", ") || "none (terminal)";
            throw new InvalidStateTransitionError(
                fromStatus,
                toStatus,
                `Current status '${fromStatus}' only permits transitions to: [${allowed}]`
            );
        }
    }

    transition(application, toStatus, options = {}) {
        const fromStatus = application.status || ApplicationStatus.PENDING;
        const {
            reason = "State updated by workflow engine",
            performedBy = "system_workflow",
            decision = null,
            decisionReason = null
        } = options;

        this.validateTransition(fromStatus, toStatus, reason);

        application.status = toStatus;
        if (decision !== null) {
            application.decision = decision;
        }
        if (decisionReason !== null) {
            application.decisionReason = decisionReason;
        }

        application.stateHistory.push({
            fromStatus,
            toStatus,
            status: toStatus,
            reason,
            performedBy,
            changedAt: new Date()
        });

        return application;
    }
}

export const stateMachine = new StateMachine();
export default stateMachine;
