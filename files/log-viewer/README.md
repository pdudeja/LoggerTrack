# Log Viewer — NestJS

A NestJS application that parses and visualises **Winston-format structured log files** (with ANSI color codes and JSON payloads), as produced by the `location-tracker` service.

---

## Features

- **Upload** any `.log` file via drag-and-drop or file picker
- **Parse** Winston-format logs: extracts timestamp, level (info/error/warn/debug), message type, request/response fields, headers, response bodies, stack traces
- **Stats bar** — total entries, level counts, request/response counts, avg response time, error rate, time range
- **Filter & search** — by level, type (Incoming Request / Outgoing Response / General), HTTP status code, or full-text search
- **Paginated table** — 100 entries/page with column colour-coding
- **Detail panel** — click any row for full structured detail, syntax-highlighted JSON, stack trace viewer
- **Request pairing** — links each request with its matching response by `requestId`

---

## Project Structure

```
log-viewer/
├── src/
│   ├── main.ts                  # Bootstrap (port 3000, static assets)
│   ├── app.module.ts
│   └── logs/
│       ├── logs.module.ts       # Multer in-memory storage
│       ├── logs.controller.ts   # REST API endpoints
│       ├── logs.service.ts      # Parser + filter + stats engine
│       └── log.dto.ts           # Types & interfaces
├── public/
│   └── index.html               # Single-page UI (zero framework deps)
├── package.json
├── tsconfig.json
└── nest-cli.json
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/logs/upload` | Upload & parse a log file (`multipart/form-data`, field `file`) |
| `GET`  | `/api/logs` | Paginated entries. Query: `level`, `type`, `search`, `path`, `statusCode`, `page`, `limit` |
| `GET`  | `/api/logs/stats` | Summary statistics for loaded file |
| `GET`  | `/api/logs/:id` | Single entry by ID |
| `GET`  | `/api/logs/:id/related` | All entries sharing the same `requestId` |

---

## Setup & Run

```bash
# Install dependencies
npm install

# Development (watch mode)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

Open **http://localhost:3000** and upload your `.log` file.

---

## Log Format Supported

Winston-format lines:
```
2026-01-27T06:19:05.543Z [[32minfo[39m]: Incoming Request  {
  "service": "location-tracker",
  "requestId": "1769494745543-qcfpee2rp",
  "method": "GET",
  "path": "/stg/location-tracker/health",
  ...
}
```

Handles:
- ANSI escape codes in level brackets (`[32m`, `[31m`, etc.)
- Multi-line JSON bodies
- Stack traces followed by JSON metadata
- Paired Incoming Request / Outgoing Response via `requestId`
