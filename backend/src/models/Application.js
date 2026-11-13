
import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema({
    applicationId: {
        type: String,
        required: true,
        unique: true
    },
    applicantName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    income: {
        type: Number,
        required: true,
        min: 0
    },
    creditScore: {
        type: Number,
        required: true,
        min: 300,
        max: 850
    },
    loanAmount: {
        type: Number,
        required: true,
        min: 1
    },
    status: {
        type: String,
        enum: [
            "PENDING",
            "PROCESSING",
            "APPROVED",
            "REJECTED",
            "MANUAL_REVIEW",
            "FAILED"
        ],
        default: "PENDING"
    },
    decision: {
        type: String,
        enum: ["APPROVE", "REJECT", "MANUAL_REVIEW", null],
        default: null
    },
    workflowVersion: {
        type: Number,
        default: 1
    },
    idempotencyKey: {
        type: String,
        required: true,
        unique: true
    },
    requestHash: {
        type: String,
        required: true
    },
    stateHistory: [{
        status: String,
        reason: String,
        changedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

applicationSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Application", applicationSchema);
