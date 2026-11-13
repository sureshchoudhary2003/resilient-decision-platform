import express from "express";
import cors from "cors";

import healthRoutes from "./routes/healthRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import workflowRoutes from "./routes/workflowRoutes.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
    cors({
        origin: process.env.CLIENT_URL || true,
        credentials: true
    })
);

app.use("/api/health", healthRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/workflows", workflowRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
