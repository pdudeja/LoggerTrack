export type LogLevel = 'info' | 'error' | 'warn' | 'debug' | 'verbose';
export type LogType = 'Incoming Request' | 'Outgoing Response' | 'General';

export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  type: LogType;
  // Request fields
  requestId?: string;
  method?: string;
  path?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
  query?: Record<string, any>;
  headers?: Record<string, string>;
  // Response fields
  statusCode?: number;
  duration?: string;
  responseBody?: any;
  // General fields
  service?: string;
  environment?: string;
  error?: string;
  stack?: string;
  raw: string;
  meta?: Record<string, any>;
}

export interface ParsedLogsResult {
  entries: LogEntry[];
  stats: LogStats;
}

export interface LogStats {
  total: number;
  info: number;
  error: number;
  warn: number;
  debug: number;
  requests: number;
  responses: number;
  avgDurationMs: number;
  errorRate: number;
  statusCodes: Record<string, number>;
  topPaths: { path: string; count: number }[];
  timeRange: { from: string; to: string } | null;
}

export interface FilterLogsDto {
  level?: LogLevel;
  type?: LogType;
  search?: string;
  path?: string;
  statusCode?: number;
  page?: number;
  limit?: number;
}
