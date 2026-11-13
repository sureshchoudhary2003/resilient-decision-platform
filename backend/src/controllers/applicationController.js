
import mongoose from "mongoose";
import { randomUUID, createHash } from "node:crypto";
import asyncHandler from "express-async-handler";

import Application from "../models/Application.js";
import AuditLog from "../models/AuditLog.js";

// CREATE APPLICATION
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

    // Check duplicate request
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
            message: "Application already exists",
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
                    reason: "Application submitted"
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
        // Handle simultaneous duplicate requests
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
                    message: "Application already exists",
                    data: duplicate
                });
            }
        }

        throw error;

    } finally {
        await session.endSession();
    }

    res.status(201).json({
        success: true,
        duplicate: false,
        message: "Application submitted successfully",
        data: application
    });
});


// GET ALL APPLICATIONS
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


// GET APPLICATION BY ID
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


// GET AUDIT HISTORY
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

