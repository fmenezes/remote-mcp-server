import express from "express";
import morgan from "morgan";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getServer } from "./mcpServer.js";

const authServerUrl = process.env.AUTH_SERVER_URL;

if (!authServerUrl) {
  throw new Error("AUTH_SERVER_URL is not set");
}

function cache<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: T | undefined;
  return async () => {
    if (cached) {
      return cached;
    }
    const result = await fn();
    cached = result;
    return cached;
  };
}

const authMetadataPath = "/.well-known/oauth-authorization-server";

const app = express();
app.use(express.json());
app.use(morgan('combined'));

function mergeUrls(url: string, baseUrl: URL) {
  const endpoint = new URL(url, baseUrl);
  
  // incase url is absolute
  endpoint.host = baseUrl.host;
  endpoint.port = baseUrl.port;
  endpoint.protocol = baseUrl.protocol;
  endpoint.pathname = (baseUrl.pathname + endpoint.pathname).replace(/\/+/g, "/");
  
  return endpoint.toString();
}

type AuthMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  registration_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  introspection_endpoint: string;
  userinfo_endpoint: string;
  revocation_endpoint: string;
  end_session_endpoint: string;
  check_session_iframe: string;
  device_authorization_endpoint: string;
  backchannel_authentication_endpoint: string;
  pushed_authorization_request_endpoint: string;
  mtls_endpoint_aliases: {
    token_endpoint: string;
    revocation_endpoint: string;
    introspection_endpoint: string;
    device_authorization_endpoint: string;
    registration_endpoint: string;
    userinfo_endpoint: string;
    pushed_authorization_request_endpoint: string;
    backchannel_authentication_endpoint: string;
  };
};

const getAuthMetadata = cache(async () => {
  const baseUrl = new URL(process.env.AUTH_SERVER_URL!);

  const response = await fetch(mergeUrls(authMetadataPath, baseUrl));
  if (!response.ok) {
    throw new Error(`Failed to fetch auth metadata: [${response.status} ${response.statusText}] ${await response.text()}`);
  }

  const responseJson = await response.json() as AuthMetadata;

  if (!responseJson) {
    throw new Error("Failed to parse auth metadata");
  }

  return responseJson;
});

app.get(authMetadataPath, async (req: express.Request, res: express.Response) => {
  res.status(200).json(await getAuthMetadata());
});

function asyncMiddleware(fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    fn(req, res, next).catch((err) => {
      console.error('Error handling MCP request:', err);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    });
  };
}

async function userInfo(token: string) {
  const authMetadata = await getAuthMetadata();
  const response = await fetch(authMetadata.userinfo_endpoint, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Authorization': token,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to get user info: [${response.status} ${response.statusText}] ${await response.text()}`);
  }
  return await response.json();
}

async function ensureAuthorization(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.headers.authorization) {
    console.error('Authorization failed, missing authorization header');
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Unauthorized, missing authorization header',
      },
      id: null,
    });
    return;
  }
  try {
    const data = await userInfo(req.headers.authorization);
    console.log('Authorization successful', data);
  } catch (err) {
    console.error('Authorization failed, invalid token', err);
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Unauthorized, invalid token',
      },
      id: null,
    });
    return;
  }
  next();
}

app.post('/mcp', asyncMiddleware(ensureAuthorization), asyncMiddleware(async (req: express.Request, res: express.Response) => {
  try {
    const server = getServer(req.headers.authorization || ""); 
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', async () => {
      console.log('Request closed');
      await transport.close();
      await server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
}));

app.get('/mcp', (req: express.Request, res: express.Response) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});

app.delete('/mcp', (req: express.Request, res: express.Response) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});

// Start the server
const PORT = 3000;
app.listen(PORT, (err?: any) => {
  if (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
  console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});
