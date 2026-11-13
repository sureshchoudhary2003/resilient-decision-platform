import express from "express";
import cors from "cors";

import healthRoutes from "./routes/healthRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import {
    notFound,
    errorHandler
} from "./middleware/errorMiddleware.js";

const app = express();

// JSON parsing
app.use(express.json({ limit: "1mb" }));

// URL encoded data
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(
    cors({
        origin: process.env.CLIENT_URL,
        credentials: true
    })
);

// Health API
app.use("/api/health", healthRoutes);
app.use("/api/applications", applicationRoutes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

export default app;