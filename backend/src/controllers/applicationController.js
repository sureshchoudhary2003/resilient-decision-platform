import mongoose from "mongoose";
import { randomUUID, createHash } from "node:crypto";
import asyncHandler from "express-async-handler";

import Application from "../models/Application.js";
import AuditLog from "../models/AuditLog.js";
import workflowService from "../services/workflowService.js";

export const createApplication = asyncHandler(async (req, res) => {
    const idempotencyKey = req.get("Idempotency-Key");

    if (!idempotencyKey || idempotencyKey.length > 128) {
        return res.status(400).json({
            success: false,
            message: "Valid Idempotency-Key header is required"
        });
    }

    const {
        applicantName,
        email,
        income,
        creditScore,
        loanAmount
    } = req.body;

    const requestData = {
        applicantName,
        email,
        income,
        creditScore,
        loanAmount
    };

    const requestHash = createHash("sha256")
        .update(JSON.stringify(requestData))
        .digest("hex");

    const existing = await Application.findOne({ idempotencyKey });

    if (existing) {
        if (existing.requestHash !== requestHash) {
            return res.status(409).json({
                success: false,
                message: "Idempotency key reused with different data"
            });
        }

        return res.status(200).json({
            success: true,
            duplicate: true,
            message: "Application already exists (idempotent replay)",
            data: existing
        });
    }

    const applicationId = `APP-${randomUUID()}`;
    const session = await mongoose.startSession();

    let application;

    try {
        await session.withTransaction(async () => {
            const [created] = await Application.create([{
                applicationId,
                ...requestData,
                status: "PENDING",
                decision: null,
                workflowVersion: 1,
                idempotencyKey,
                requestHash,
                stateHistory: [{
                    status: "PENDING",
                    reason: "Application submitted and received"
                }]
            }], { session });

            application = created;

            await AuditLog.create([{
                applicationId,
                event: "APPLICATION_CREATED",
                details: {
                    status: "PENDING",
                    message: "Application successfully submitted"
                }
            }], { session });
        });

    } catch (error) {
        if (error.code === 11000) {
            const duplicate = await Application.findOne({ idempotencyKey });

            if (duplicate) {
                if (duplicate.requestHash !== requestHash) {
                    return res.status(409).json({
                        success: false,
                        message: "Idempotency key reused with different data"
                    });
                }

                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    message: "Application already exists (idempotent replay)",
                    data: duplicate
                });
            }
        }

        throw error;

    } finally {
        await session.endSession();
    }

    const simulateFailure = req.get("x-simulate-bureau-failure") === "true" || req.query.simulateFailure === "true";
    const failAttempts = parseInt(req.query.failAttempts || req.get("x-fail-attempts") || "0", 10);

    const processResult = await workflowService.processApplication(applicationId, {
        simulateFailure,
        failAttempts
    });

    res.status(201).json({
        success: true,
        duplicate: false,
        message: "Application submitted and evaluated successfully",
        data: processResult.application,
        decision: processResult.decision,
        status: processResult.status,
        decisionReason: processResult.decisionReason,
        ruleTrace: processResult.ruleTrace,
        enrichmentData: processResult.enrichmentData
    });
});

export const getApplications = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));

    const [applications, total] = await Promise.all([
        Application.find()
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),

        Application.countDocuments()
    ]);

    res.status(200).json({
        success: true,
        data: applications,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    });
});

export const getApplicationById = asyncHandler(async (req, res) => {
    const application = await Application.findOne({
        applicationId: req.params.applicationId
    });

    if (!application) {
        return res.status(404).json({
            success: false,
            message: "Application not found"
        });
    }

    res.status(200).json({
        success: true,
        data: application
    });
});

export const getApplicationAudit = asyncHandler(async (req, res) => {
    const application = await Application.findOne({
        applicationId: req.params.applicationId
    });

    if (!application) {
        return res.status(404).json({
            success: false,
            message: "Application not found"
        });
    }

    const logs = await AuditLog.find({
        applicationId: req.params.applicationId
    }).sort({ timestamp: 1 });

    res.status(200).json({
        success: true,
        data: logs
    });
});

export const reviewApplication = asyncHandler(async (req, res) => {
    const { applicationId } = req.params;
    const { decision, reviewer, notes } = req.body;

    if (!decision) {
        return res.status(400).json({
            success: false,
            message: "Decision ('APPROVED' or 'REJECTED') is required"
        });
    }

    const updated = await workflowService.reviewApplication(applicationId, {
        decision,
        reviewer: reviewer || "underwriter_agent",
        notes: notes || "Manual underwriter review determination"
    });

    res.status(200).json({
        success: true,
        message: `Application ${applicationId} manual review completed`,
        data: updated
    });
});

export const retryApplication = asyncHandler(async (req, res) => {
    const { applicationId } = req.params;
    const simulateFailure = req.get("x-simulate-bureau-failure") === "true" || req.query.simulateFailure === "true";
    const failAttempts = parseInt(req.query.failAttempts || req.get("x-fail-attempts") || "0", 10);

    const result = await workflowService.processApplication(applicationId, {
        simulateFailure,
        failAttempts
    });

    res.status(200).json({
        success: result.success,
        message: result.success ? "Application retried and processed successfully" : "Application retry failed",
        data: result.application
    });
});
