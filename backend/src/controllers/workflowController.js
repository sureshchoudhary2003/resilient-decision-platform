import asyncHandler from "express-async-handler";
import WorkflowConfig from "../models/WorkflowConfig.js";
import workflowService from "../services/workflowService.js";

export const getWorkflows = asyncHandler(async (req, res) => {
    const { useCase } = req.query;
    const filter = {};
    if (useCase) filter.useCase = useCase;

    const workflows = await WorkflowConfig.find(filter).sort({ version: -1 });

    res.status(200).json({
        success: true,
        count: workflows.length,
        data: workflows
    });
});

export const getActiveWorkflow = asyncHandler(async (req, res) => {
    const useCase = req.query.useCase || "LOAN_APPROVAL";
    const workflow = await workflowService.getActiveWorkflow(useCase);

    res.status(200).json({
        success: true,
        data: workflow
    });
});

export const createWorkflow = asyncHandler(async (req, res) => {
    const { name, useCase = "LOAN_APPROVAL", rules, stages, activate = true } = req.body;

    if (!name || !rules || !Array.isArray(rules)) {
        return res.status(400).json({
            success: false,
            message: "Workflow name and an array of rules are required"
        });
    }

    const latest = await WorkflowConfig.findOne({ useCase }).sort({ version: -1 });
    const nextVersion = latest ? latest.version + 1 : 1;

    if (activate) {
        await WorkflowConfig.updateMany({ useCase, active: true }, { active: false });
    }

    const newWorkflow = await WorkflowConfig.create({
        name,
        useCase,
        version: nextVersion,
        active: activate,
        rules,
        stages: stages || [
            { name: "Schema Validation", type: "VALIDATION", order: 1, enabled: true },
            { name: "External Credit & Fraud Enrichment", type: "ENRICHMENT", order: 2, enabled: true },
            { name: "Rules Evaluation Engine", type: "EVALUATION", order: 3, enabled: true },
            { name: "Decision & State Transition", type: "FINALIZATION", order: 4, enabled: true }
        ]
    });

    res.status(201).json({
        success: true,
        message: `Workflow configuration version ${nextVersion} created successfully`,
        data: newWorkflow
    });
});

export const activateWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const workflow = await WorkflowConfig.findById(id);
    if (!workflow) {
        return res.status(404).json({
            success: false,
            message: "Workflow configuration not found"
        });
    }

    await WorkflowConfig.updateMany(
        { useCase: workflow.useCase, active: true },
        { active: false }
    );

    workflow.active = true;
    await workflow.save();

    res.status(200).json({
        success: true,
        message: `Workflow '${workflow.name}' (v${workflow.version}) is now active`,
        data: workflow
    });
});

export const updateWorkflowRules = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
        return res.status(400).json({
            success: false,
            message: "Rules array is required"
        });
    }

    const workflow = await WorkflowConfig.findById(id);
    if (!workflow) {
        return res.status(404).json({
            success: false,
            message: "Workflow configuration not found"
        });
    }

    workflow.rules = rules;
    await workflow.save();

    res.status(200).json({
        success: true,
        message: `Rules updated for workflow '${workflow.name}'`,
        data: workflow
    });
});
