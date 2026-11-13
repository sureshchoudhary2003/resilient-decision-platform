import dns from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/db.js";
import workflowService from "./services/workflowService.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();
        await workflowService.seedDefaultWorkflow();

        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Health API: http://localhost:${PORT}/api/health`);
        });

        const shutdown = () => {
            console.log("Shutting down server...");
            server.close(async () => {
                await mongoose.connection.close();
                console.log("MongoDB connection closed");
                process.exit(0);
            });
        };

        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);

    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();
