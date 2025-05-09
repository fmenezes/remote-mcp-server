import path from "path";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import morgan from "morgan";
import { randomUUID } from "crypto";
import { InMemoryEventStore } from "./inMemoryEventStore.js";
import { getServer } from "./mcpServer.js";

// Start the server
const PORT = 3000;
const authEndpoint = process.env.AUTH_ENDPOINT || "http://localhost:9000/realms/master";
const internalAuthEndpoint = process.env.INTERNAL_AUTH_ENDPOINT || authEndpoint;
const issuer = process.env.ISSUER || authEndpoint;

const __dirname = import.meta.dirname;

const app = express();
app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public")));
app.use(morgan("combined"));
app.use(express.json());
app.use(express.raw());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

function asyncMiddleware(
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>
) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        fn(req, res, next).catch(next);
    };
}

app.use("/.well-known/oauth-authorization-server", async (req: express.Request, res: express.Response) => {
    const response = await fetch(`${internalAuthEndpoint}/.well-known/oauth-authorization-server`);
    const metadata = await response.json();

    res.json({
        ...metadata,
        authorization_endpoint: `${authEndpoint}/protocol/openid-connect/auth`,
        token_endpoint: `${authEndpoint}/protocol/openid-connect/token`,
        revocation_endpoint: `${authEndpoint}/protocol/openid-connect/revoke`,
        registration_endpoint: `${authEndpoint}/clients-registrations/openid-connect`,
    });
});

function ensureAuthenticated(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!req.headers.authorization) {
        res.status(401).send("Unauthorized");
        return;
    }

    next();
}

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

app.post(
    "/mcp",
    ensureAuthenticated,
    asyncMiddleware(async (req: express.Request, res: express.Response) => {
        console.log("Received MCP request:", req.body);
        try {
            // Check for existing session ID
            const sessionId = req.headers["mcp-session-id"] as string | undefined;
            let transport: StreamableHTTPServerTransport;

            if (sessionId && transports[sessionId]) {
                // Reuse existing transport
                transport = transports[sessionId];
            } else if (!sessionId && isInitializeRequest(req.body)) {
                // New initialization request
                const eventStore = new InMemoryEventStore();
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    eventStore, // Enable resumability
                    onsessioninitialized: (sessionId) => {
                        // Store the transport by session ID when session is initialized
                        // This avoids race conditions where requests might come in before the session is stored
                        console.log(`Session initialized with ID: ${sessionId}`);
                        transports[sessionId] = transport;
                    },
                });

                // Set up onclose handler to clean up transport when closed
                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid && transports[sid]) {
                        console.log(`Transport closed for session ${sid}, removing from transports map`);
                        delete transports[sid];
                    }
                };

                // Connect the transport to the MCP server BEFORE handling the request
                // so responses can flow back through the same transport
                const server = getServer();
                await server.connect(transport);

                await transport.handleRequest(req, res, req.body);
                return; // Already handled
            } else {
                // Invalid request - no session ID or not initialization request
                res.status(400).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32000,
                        message: "Bad Request: No valid session ID provided",
                    },
                    id: null,
                });
                return;
            }

            // Handle the request with existing transport - no need to reconnect
            // The existing transport is already connected to the server
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error("Error handling MCP request:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32603,
                        message: "Internal server error",
                    },
                    id: null,
                });
            }
        }
    })
);

// Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
app.get(
    "/mcp",
    ensureAuthenticated,
    asyncMiddleware(async (req: express.Request, res: express.Response) => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (!sessionId || !transports[sessionId]) {
            res.status(400).send("Invalid or missing session ID");
            return;
        }

        // Check for Last-Event-ID header for resumability
        const lastEventId = req.headers["last-event-id"] as string | undefined;
        if (lastEventId) {
            console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
        } else {
            console.log(`Establishing new SSE stream for session ${sessionId}`);
        }

        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
    })
);

// Handle DELETE requests for session termination (according to MCP spec)
app.delete(
    "/mcp",
    ensureAuthenticated,
    asyncMiddleware(async (req: express.Request, res: express.Response) => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (!sessionId || !transports[sessionId]) {
            res.status(400).send("Invalid or missing session ID");
            return;
        }

        console.log(`Received session termination request for session ${sessionId}`);

        try {
            const transport = transports[sessionId];
            await transport.handleRequest(req, res);
        } catch (error) {
            console.error("Error handling session termination:", error);
            if (!res.headersSent) {
                res.status(500).send("Error processing session termination");
            }
        }
    })
);

app.listen(PORT, () => {
    console.log(`MCP Streamable HTTP Server listening on port ${PORT}`);
});

// Handle server shutdown
process.on("SIGINT", async () => {
    console.log("Shutting down server...");

    // Close all active transports to properly clean up resources
    for (const sessionId in transports) {
        try {
            console.log(`Closing transport for session ${sessionId}`);
            await transports[sessionId].close();
            delete transports[sessionId];
        } catch (error) {
            console.error(`Error closing transport for session ${sessionId}:`, error);
        }
    }
    console.log("Server shutdown complete");
    process.exit(0);
});
