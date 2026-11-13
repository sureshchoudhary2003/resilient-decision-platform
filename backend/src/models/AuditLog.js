
import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
    applicationId: {
        type: String,
        required: true,
        index: true
    },
    event: {
        type: String,
        required: true
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    ruleTrace: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

auditLogSchema.index({ applicationId: 1, timestamp: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
