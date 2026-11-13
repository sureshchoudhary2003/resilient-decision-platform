import express from "express";
import {
    getWorkflows,
    getActiveWorkflow,
    createWorkflow,
    activateWorkflow,
    updateWorkflowRules
} from "../controllers/workflowController.js";

const router = express.Router();

router.get("/", getWorkflows);
router.get("/active", getActiveWorkflow);
router.post("/", createWorkflow);
router.put("/:id/activate", activateWorkflow);
router.put("/:id/rules", updateWorkflowRules);

export default router;

