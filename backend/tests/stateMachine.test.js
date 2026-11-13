import { describe, it } from "node:test";
import assert from "node:assert/strict";
import stateMachine, { ApplicationStatus, InvalidStateTransitionError } from "../src/services/stateMachine.js";

describe("Workflow State Machine Tests", () => {
    it("Permits valid transition from PENDING to PROCESSING", () => {
        const app = {
            status: ApplicationStatus.PENDING,
            stateHistory: []
        };

        stateMachine.transition(app, ApplicationStatus.PROCESSING, {
            reason: "Workflow started"
        });

        assert.equal(app.status, ApplicationStatus.PROCESSING);
        assert.equal(app.stateHistory.length, 1);
        assert.equal(app.stateHistory[0].fromStatus, ApplicationStatus.PENDING);
        assert.equal(app.stateHistory[0].toStatus, ApplicationStatus.PROCESSING);
    });

    it("Permits valid transition from PROCESSING to APPROVED", () => {
        const app = {
            status: ApplicationStatus.PROCESSING,
            stateHistory: []
        };

        stateMachine.transition(app, ApplicationStatus.APPROVED, {
            reason: "All rules satisfied",
            decision: "APPROVED"
        });

        assert.equal(app.status, ApplicationStatus.APPROVED);
        assert.equal(app.decision, "APPROVED");
    });

    it("Permits valid transition from MANUAL_REVIEW to APPROVED", () => {
        const app = {
            status: ApplicationStatus.MANUAL_REVIEW,
            stateHistory: []
        };

        stateMachine.transition(app, ApplicationStatus.APPROVED, {
            reason: "Underwriter override approved",
            performedBy: "senior_underwriter"
        });

        assert.equal(app.status, ApplicationStatus.APPROVED);
        assert.equal(app.stateHistory[0].performedBy, "senior_underwriter");
    });

    it("Permits valid transition from FAILED to PROCESSING on retry", () => {
        const app = {
            status: ApplicationStatus.FAILED,
            stateHistory: []
        };

        stateMachine.transition(app, ApplicationStatus.PROCESSING, {
            reason: "Retry initiated"
        });

        assert.equal(app.status, ApplicationStatus.PROCESSING);
    });

    it("REJECTS illegal transition from APPROVED to PENDING", () => {
        const app = {
            status: ApplicationStatus.APPROVED,
            stateHistory: []
        };

        assert.throws(
            () => stateMachine.transition(app, ApplicationStatus.PENDING),
            (err) => err instanceof InvalidStateTransitionError
        );
    });

    it("REJECTS illegal transition from REJECTED to APPROVED", () => {
        const app = {
            status: ApplicationStatus.REJECTED,
            stateHistory: []
        };

        assert.throws(
            () => stateMachine.transition(app, ApplicationStatus.APPROVED),
            (err) => err instanceof InvalidStateTransitionError
        );
    });

    it("REJECTS illegal transition from PENDING directly to APPROVED (skipping PROCESSING)", () => {
        const app = {
            status: ApplicationStatus.PENDING,
            stateHistory: []
        };

        assert.throws(
            () => stateMachine.transition(app, ApplicationStatus.APPROVED),
            (err) => err instanceof InvalidStateTransitionError
        );
    });
});

