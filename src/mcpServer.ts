import packageJson from "../package.json" with { type: "json" };
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function getServer() {
    const mcpServer = new McpServer({
        name: "Demo Server",
        version: packageJson.version,
    });

    mcpServer.tool("hello", {}, async () => {
        return {
            content: [
                {
                    type: "text",
                    text: "Hello from the Model Context Protocol!",
                },
            ],
        };
    });

    return mcpServer;
}
