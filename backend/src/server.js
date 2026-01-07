import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import "dotenv/config";
import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/db.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        // Connect MongoDB first
        await connectDB();

        // Start Express server
        const server = app.listen(PORT, () => {
            console.log(
                `Server running on port ${PORT}`
            );

            console.log(
                `Health API: http://localhost:${PORT}/api/health`
            );
        });

        // Graceful shutdown
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
        console.error(
            "Server startup failed:",
            error.message
        );

        process.exit(1);
    }
};

startServer();