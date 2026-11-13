
import express from "express";
import { body } from "express-validator";

import validateRequest from "../middleware/validateRequest.js";

import {
    createApplication,
    getApplications,
    getApplicationById,
    getApplicationAudit,
    reviewApplication,
    retryApplication
} from "../controllers/applicationController.js";

const router = express.Router();

const applicationValidation = [
    body("applicantName")
        .isString()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Applicant name must be 2-100 characters"),

    body("email")
        .isEmail()
        .normalizeEmail()
        .withMessage("Valid email is required"),

    body("income")
        .isFloat({ min: 0 })
        .toFloat()
        .withMessage("Income must be non-negative"),

    body("creditScore")
        .isInt({ min: 300, max: 850 })
        .toInt()
        .withMessage("Credit score must be 300-850"),

    body("loanAmount")
        .isFloat({ min: 1 })
        .toFloat()
        .withMessage("Loan amount must be greater than zero")
];

router.post(
    "/",
    applicationValidation,
    validateRequest,
    createApplication
);

router.get("/", getApplications);

router.get("/:applicationId/audit", getApplicationAudit);

router.post("/:applicationId/review", reviewApplication);

router.post("/:applicationId/retry", retryApplication);

router.get("/:applicationId", getApplicationById);

export default router;

