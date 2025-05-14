import packageJson from "../package.json" with { type: "json" };
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function getServer(accessToken: string) {
    const mcpServer = new McpServer({
        name: "Demo Server",
        version: packageJson.version,
    });

    mcpServer.tool("greet", {}, async () => {
        return {
            content: [
                {
                    type: "text",
                    text: `Hello, world!
Your access token is: ${accessToken}
`,
                },
            ],
        };
    });

    return mcpServer;
}
