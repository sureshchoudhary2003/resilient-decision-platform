import express from "express";
import mongoose from "mongoose";

const router = express.Router();

router.get("/", (req, res) => {

    const dbStatus =
        mongoose.connection.readyState === 1
            ? "connected"
            : "disconnected";

    res.status(200).json({
        success: true,
        message: "Resilient Decision Platform API is running",

        data: {
            server: "healthy",
            database: dbStatus,
            environment: process.env.NODE_ENV,
            timestamp: new Date().toISOString()
        }
    });
});

export default router;