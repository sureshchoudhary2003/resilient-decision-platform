
import mongoose from "mongoose";

const workflowConfigSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    useCase: {
        type: String,
        default: "LOAN_APPROVAL"
    },
    version: {
        type: Number,
        required: true,
        default: 1
    },
    active: {
        type: Boolean,
        default: true
    },
    rules: [{
        name: String,
        field: String,
        operator: {
            type: String,
            enum: ["eq", "neq", "gt", "gte", "lt", "lte"]
        },
        value: mongoose.Schema.Types.Mixed,
        outcome: {
            type: String,
            enum: ["REJECT", "MANUAL_REVIEW", "CONTINUE"]
        },
        priority: {
            type: Number,
            default: 1
        },
        enabled: {
            type: Boolean,
            default: true
        }
    }],
    stages: [{
        name: String,
        type: String,
        enabled: {
            type: Boolean,
            default: true
        }
    }]
}, {
    timestamps: true
});

workflowConfigSchema.index(
    { name: 1, version: 1 },
    { unique: true }
);

export default mongoose.model("WorkflowConfig", workflowConfigSchema);

