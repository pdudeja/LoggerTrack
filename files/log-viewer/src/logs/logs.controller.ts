import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { LogsService } from './logs.service';
import { FilterLogsDto, LogLevel, LogType } from './log.dto';
import { join } from 'path';

@Controller('api/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  /**
   * POST /api/logs/upload
   * Upload a .log file and parse it
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const result = this.logsService.parse(file.buffer, file.originalname);
    return {
      message: 'File parsed successfully',
      fileName: file.originalname,
      size: file.size,
      entries: result.entries.length,
      stats: result.stats,
    };
  }

  /**
   * GET /api/logs
   * Paginated, filtered log entries
   */
  @Get()
  findAll(
    @Query('level') level?: LogLevel,
    @Query('type') type?: LogType,
    @Query('search') search?: string,
    @Query('path') path?: string,
    @Query('statusCode') statusCode?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const dto: FilterLogsDto = { level, type, search, path, statusCode, page, limit };
    return this.logsService.filter(dto);
  }

  /**
   * GET /api/logs/stats
   * Summary statistics
   */
  @Get('stats')
  stats() {
    const stats = this.logsService.getStats();
    if (!stats) return { message: 'No file loaded yet', fileName: null, stats: null };
    return { fileName: this.logsService.getFileName(), stats };
  }

  /**
   * GET /api/logs/:id
   * Single log entry by ID
   */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const entry = this.logsService.getById(id);
    if (!entry) throw new NotFoundException(`Log entry #${id} not found`);
    return entry;
  }

  /**
   * GET /api/logs/:id/related
   * All log entries sharing the same requestId (request + response pair)
   */
  @Get(':id/related')
  related(@Param('id', ParseIntPipe) id: number) {
    const entry = this.logsService.getById(id);
    if (!entry) throw new NotFoundException(`Log entry #${id} not found`);
    if (!entry.requestId) return { entries: [entry] };
    return { entries: this.logsService.getRelated(entry.requestId) };
  }
}
