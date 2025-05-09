import packageJson from "../package.json" with { type: "json" };
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const ATLAS_API_BASE_URL = process.env.ATLAS_API_BASE_URL || "https://cloud.mongodb.com";

export function getServer(accessToken: string) {
    const mcpServer = new McpServer({
        name: "Demo Server",
        version: packageJson.version,
    });

    mcpServer.tool("list-clusters", {}, async () => {
        console.error("accessToken", accessToken);
        const response = await fetch(`${ATLAS_API_BASE_URL}/api/atlas/v2/clusters`, {
            headers: {
                "Authorization": accessToken,
            },
        })

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch clusters: [${response.status} ${response.statusText}] ${errorText}`);
        }

        const data = await response.json();

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    });

    return mcpServer;
}
