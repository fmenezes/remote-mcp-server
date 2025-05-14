# Remote MCP Server

To test the server:
```bash
npm run inspect
```

## Running with Docker Compose

### Prerequisites
- Docker
- Docker Compose

### Steps to Run

1. Clone the repository:
```bash
git clone <repository-url>
cd remote-mcp-server
```

2. Start the application using Docker Compose:
```bash
docker compose up
```

The application will be available at `http://localhost:3000` (or the port specified in your configuration).

### Available Users

The following users are pre-configured in the system:

| Email | Password |
|-------|----------|
| user1@example.com | 1234 |
| user2@example.com | 1234 |

### Stopping the Application

To stop the application, press `Ctrl+C` in the terminal where Docker Compose is running, or run:

```bash
docker compose down
```

### Additional Commands

- To run in detached mode (background):
```bash
docker compose up -d
```

- To view logs:
```bash
docker compose logs -f
```

- To rebuild containers:
```bash
docker compose build
```
