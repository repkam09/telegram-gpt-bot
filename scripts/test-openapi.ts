#!/usr/bin/env node

/**
 * Simple test script to verify OpenAPI endpoints are working
 * This script starts a minimal Express server with OpenAPI enabled
 */

import express from "express";
import swaggerUi from "swagger-ui-express";
import { generateOpenApiDocument } from "../src/client/openapi";

const app = express();
const PORT = 3333;

// Enable development mode features
const openApiDocument = generateOpenApiDocument();

// Serve OpenAPI JSON spec
app.get("/openapi.json", (req, res) => {
    return res.status(200).json(openApiDocument);
});

// Serve Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Hennos API Documentation"
}));

app.get("/", (req, res) => {
    res.send(`
        <html>
        <head><title>Hennos OpenAPI Test</title></head>
        <body>
            <h1>Hennos OpenAPI Test Server</h1>
            <p>Server is running! Visit the following endpoints:</p>
            <ul>
                <li><a href="/openapi.json">OpenAPI JSON Spec</a></li>
                <li><a href="/api-docs">Swagger UI Documentation</a></li>
            </ul>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`\n✅ OpenAPI test server running at http://localhost:${PORT}`);
    console.log(`📄 OpenAPI spec: http://localhost:${PORT}/openapi.json`);
    console.log(`📚 Swagger UI: http://localhost:${PORT}/api-docs\n`);
    console.log("Press Ctrl+C to stop the server\n");
});
