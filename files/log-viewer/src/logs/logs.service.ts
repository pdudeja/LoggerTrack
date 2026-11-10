import { Injectable } from '@nestjs/common';
import {
  LogEntry,
  LogLevel,
  LogType,
  ParsedLogsResult,
  LogStats,
  FilterLogsDto,
} from './log.dto';

// Strip ANSI escape codes (e.g. [32m, [39m)
function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

// Detect level from raw ANSI-colored bracket text
function detectLevel(raw: string): LogLevel {
  if (/\[31m/.test(raw)) return 'error';
  if (/\[33m/.test(raw)) return 'warn';
  if (/\[34m/.test(raw)) return 'debug';
  if (/\[35m/.test(raw)) return 'verbose';
  return 'info';
}

@Injectable()
export class LogsService {
  private cachedEntries: LogEntry[] = [];
  private cachedStats: LogStats | null = null;
  private fileName: string = '';

  /**
   * Parse a raw log file buffer into structured LogEntry objects.
   * Handles multi-line Winston logs where JSON body follows the header line.
   */
  parse(buffer: Buffer, fileName: string): ParsedLogsResult {
    this.fileName = fileName;
    const text = buffer.toString('utf-8');
    const lines = text.split('\n');

    const entries: LogEntry[] = [];
    let id = 0;

    // Log entry starts pattern: ISO timestamp + level bracket
    const headerRe = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+\[.*?\]:\s+(.*)$/;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!headerRe.test(line)) {
        i++;
        continue;
      }

      const level = detectLevel(line);
      const clean = stripAnsi(line);
      const match = clean.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+\[(\w+)\]:\s+(.*)$/);
      if (!match) { i++; continue; }

      const [, timestamp, , messagePart] = match;

      // Collect continuation lines (JSON body or stack trace)
      const rawLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length && !headerRe.test(lines[j]) && lines[j].trim() !== '') {
        rawLines.push(lines[j]);
        j++;
      }
      i = j;

      const rawBlock = rawLines.join('\n');
      const bodyText = rawLines.slice(1).join('\n').trim();

      // Parse JSON body that may be embedded in the block
      let meta: Record<string, any> = {};
      let stack: string | undefined;

      if (bodyText) {
        // Try to extract JSON object — it may be preceded by a stack trace
        const jsonStart = bodyText.indexOf('{');
        const jsonEnd = bodyText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          try {
            meta = JSON.parse(bodyText.substring(jsonStart, jsonEnd + 1));
          } catch {
            // Non-JSON body — try line-by-line key: value extraction
            for (const bl of rawLines.slice(1)) {
              const kv = bl.match(/^\s+"(\w+)":\s+"?([^",\n]+)"?,?\s*$/);
              if (kv) meta[kv[1]] = kv[2];
            }
          }
          // Stack trace is everything before the JSON
          if (jsonStart > 0) {
            stack = bodyText.substring(0, jsonStart).trim();
          }
        } else {
          // Purely a stack trace or plain text
          stack = bodyText;
        }
      }

      const message = messagePart.trim();
      const type: LogType = message.startsWith('Incoming Request')
        ? 'Incoming Request'
        : message.startsWith('Outgoing Response')
        ? 'Outgoing Response'
        : 'General';

      const entry: LogEntry = {
        id: ++id,
        timestamp,
        level,
        message,
        type,
        raw: rawBlock,
        service: meta.service,
        environment: meta.environment,
        requestId: meta.requestId,
        method: meta.method,
        path: meta.path,
        url: meta.url,
        ip: meta.ip,
        userAgent: meta.userAgent,
        query: meta.query,
        headers: meta.headers,
        statusCode: meta.statusCode ? Number(meta.statusCode) : undefined,
        duration: meta.duration,
        responseBody: meta.responseBody,
        error: meta.error,
        stack,
        meta,
      };

      entries.push(entry);
    }

    this.cachedEntries = entries;
    this.cachedStats = this.computeStats(entries);

    return { entries, stats: this.cachedStats };
  }

  private computeStats(entries: LogEntry[]): LogStats {
    const stats: LogStats = {
      total: entries.length,
      info: 0,
      error: 0,
      warn: 0,
      debug: 0,
      requests: 0,
      responses: 0,
      avgDurationMs: 0,
      errorRate: 0,
      statusCodes: {},
      topPaths: [],
      timeRange: null,
    };

    const pathCounts: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;
    const timestamps: string[] = [];

    for (const e of entries) {
      // Level counts
      if (e.level === 'info') stats.info++;
      else if (e.level === 'error') stats.error++;
      else if (e.level === 'warn') stats.warn++;
      else if (e.level === 'debug') stats.debug++;

      // Type counts
      if (e.type === 'Incoming Request') stats.requests++;
      if (e.type === 'Outgoing Response') stats.responses++;

      // Status codes
      if (e.statusCode) {
        const key = String(e.statusCode);
        stats.statusCodes[key] = (stats.statusCodes[key] || 0) + 1;
      }

      // Duration
      if (e.duration) {
        const ms = parseInt(e.duration, 10);
        if (!isNaN(ms)) {
          totalDuration += ms;
          durationCount++;
        }
      }

      // Path frequency
      if (e.path) {
        const p = e.path.split('?')[0];
        pathCounts[p] = (pathCounts[p] || 0) + 1;
      }

      timestamps.push(e.timestamp);
    }

    if (durationCount > 0) {
      stats.avgDurationMs = Math.round(totalDuration / durationCount);
    }

    stats.errorRate = stats.total > 0
      ? Math.round((stats.error / stats.total) * 1000) / 10
      : 0;

    stats.topPaths = Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    if (timestamps.length > 0) {
      const sorted = [...timestamps].sort();
      stats.timeRange = { from: sorted[0], to: sorted[sorted.length - 1] };
    }

    return stats;
  }

  getStats(): LogStats | null {
    return this.cachedStats;
  }

  getFileName(): string {
    return this.fileName;
  }

  filter(dto: FilterLogsDto): { entries: LogEntry[]; total: number; page: number; limit: number; pages: number } {
    let result = [...this.cachedEntries];

    if (dto.level) result = result.filter(e => e.level === dto.level);
    if (dto.type) result = result.filter(e => e.type === dto.type);
    if (dto.statusCode) result = result.filter(e => e.statusCode === Number(dto.statusCode));
    if (dto.path) result = result.filter(e => e.path?.includes(dto.path));
    if (dto.search) {
      const q = dto.search.toLowerCase();
      result = result.filter(e =>
        e.message.toLowerCase().includes(q) ||
        e.raw.toLowerCase().includes(q) ||
        (e.requestId || '').toLowerCase().includes(q) ||
        (e.path || '').toLowerCase().includes(q),
      );
    }

    const total = result.length;
    const limit = Math.min(Number(dto.limit) || 50, 200);
    const page = Math.max(Number(dto.page) || 1, 1);
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const entries = result.slice(offset, offset + limit);

    return { entries, total, page, limit, pages };
  }

  getById(id: number): LogEntry | undefined {
    return this.cachedEntries.find(e => e.id === id);
  }

  // Pair a request with its matching response
  getRelated(requestId: string): LogEntry[] {
    return this.cachedEntries.filter(e => e.requestId === requestId);
  }
}
