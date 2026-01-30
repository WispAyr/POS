import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';
import {
  EmailParserConfig,
  ParsedPaymentRecord,
  IngestionError,
} from '../../domain/entities/payment-provider.types';

export interface ParseResult {
  records: ParsedPaymentRecord[];
  errors: IngestionError[];
  totalRows: number;
}

@Injectable()
export class EmailPaymentParserService {
  private readonly logger = new Logger(EmailPaymentParserService.name);

  async parseAttachment(
    buffer: Buffer,
    filename: string,
    config: EmailParserConfig,
  ): Promise<ParseResult> {
    const attachmentType = config.attachmentType;

    if (attachmentType === 'CSV') {
      return this.parseCsv(buffer, config);
    } else if (attachmentType === 'EXCEL') {
      return this.parseExcel(buffer, filename, config);
    }

    throw new Error(`Unsupported attachment type: ${attachmentType}`);
  }

  private parseCsv(buffer: Buffer, config: EmailParserConfig): ParseResult {
    const parserConfig = config.parserConfig;
    const records: ParsedPaymentRecord[] = [];
    const errors: IngestionError[] = [];

    try {
      const content = buffer.toString('utf-8');
      const rows = csvParse(content, {
        delimiter: parserConfig.delimiter || ',',
        columns: true,
        skip_empty_lines: true,
        from_line: (parserConfig.skipRows || 0) + 1,
      });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + (parserConfig.skipRows || 0) + 2; // +2 for 1-indexed and header

        try {
          const record = this.mapRowToRecord(row, parserConfig, rowNum);
          if (record) {
            records.push(record);
          }
        } catch (err: any) {
          errors.push({
            row: rowNum,
            message: err.message,
            value: row,
            timestamp: new Date(),
          });
        }
      }

      return { records, errors, totalRows: rows.length };
    } catch (err: any) {
      this.logger.error(`Failed to parse CSV: ${err.message}`);
      errors.push({
        message: `CSV parse error: ${err.message}`,
        timestamp: new Date(),
      });
      return { records, errors, totalRows: 0 };
    }
  }

  private parseExcel(
    buffer: Buffer,
    filename: string,
    config: EmailParserConfig,
  ): ParseResult {
    const parserConfig = config.parserConfig;
    const records: ParsedPaymentRecord[] = [];
    const errors: IngestionError[] = [];

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // If headerRow is specified, use raw array parsing with custom header row
      if (parserConfig.headerRow !== undefined) {
        return this.parseExcelWithHeaderRow(sheet, parserConfig);
      }

      // Convert to JSON with header row
      const rows = XLSX.utils.sheet_to_json(sheet, {
        raw: false,
        defval: '',
      }) as any[];

      // Skip rows if configured
      const dataRows = rows.slice(parserConfig.skipRows || 0);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + (parserConfig.skipRows || 0) + 2;

        try {
          const record = this.mapRowToRecord(row, parserConfig, rowNum);
          if (record) {
            records.push(record);
          }
        } catch (err: any) {
          errors.push({
            row: rowNum,
            message: err.message,
            value: row,
            timestamp: new Date(),
          });
        }
      }

      return { records, errors, totalRows: dataRows.length };
    } catch (err: any) {
      this.logger.error(`Failed to parse Excel: ${err.message}`);
      errors.push({
        message: `Excel parse error: ${err.message}`,
        timestamp: new Date(),
      });
      return { records, errors, totalRows: 0 };
    }
  }

  private parseExcelWithHeaderRow(
    sheet: XLSX.WorkSheet,
    parserConfig: EmailParserConfig['parserConfig'],
  ): ParseResult {
    const records: ParsedPaymentRecord[] = [];
    const errors: IngestionError[] = [];

    try {
      // Parse as raw array
      const rawRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: '',
      }) as string[][];

      const headerRowIdx = parserConfig.headerRow || 0;
      const dataStartRow = parserConfig.skipRows || (headerRowIdx + 1);

      // Get header row
      const headers = rawRows[headerRowIdx] || [];
      this.logger.debug(`Headers at row ${headerRowIdx}: ${headers.join(', ')}`);

      // Process data rows
      for (let i = dataStartRow; i < rawRows.length; i++) {
        const rowData = rawRows[i];
        if (!rowData || rowData.every((cell) => !cell)) continue; // Skip empty rows

        const rowNum = i + 1; // 1-indexed for user-facing

        // Create object from headers and row data
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j] || `col_${j}`;
          row[header] = rowData[j] || '';
        }

        try {
          const record = this.mapRowToRecord(row, parserConfig, rowNum);
          if (record) {
            records.push(record);
          }
        } catch (err: any) {
          errors.push({
            row: rowNum,
            message: err.message,
            value: row,
            timestamp: new Date(),
          });
        }
      }

      return { records, errors, totalRows: rawRows.length - dataStartRow };
    } catch (err: any) {
      this.logger.error(`Failed to parse Excel with header row: ${err.message}`);
      errors.push({
        message: `Excel parse error: ${err.message}`,
        timestamp: new Date(),
      });
      return { records, errors, totalRows: 0 };
    }
  }

  private mapRowToRecord(
    row: any,
    parserConfig: EmailParserConfig['parserConfig'],
    rowNum: number,
  ): ParsedPaymentRecord | null {
    const mapping = parserConfig.columnMapping;

    // Get VRM - required
    const vrmRaw = this.getColumnValue(row, mapping.vrm);
    if (!vrmRaw) {
      throw new Error(`Missing VRM at row ${rowNum}`);
    }

    // Normalize VRM
    const vrm = this.normalizeVrm(vrmRaw);
    if (!vrm) {
      throw new Error(`Invalid VRM "${vrmRaw}" at row ${rowNum}`);
    }

    // Get amount - required
    const amountRaw = this.getColumnValue(row, mapping.amount);
    const amount = this.parseAmount(amountRaw);
    if (amount === null) {
      throw new Error(`Invalid amount "${amountRaw}" at row ${rowNum}`);
    }

    // Get dates - required
    const startTimeRaw = this.getColumnValue(row, mapping.startTime);
    const expiryTimeRaw = this.getColumnValue(row, mapping.expiryTime);

    const startTime = this.parseDate(startTimeRaw, parserConfig.dateFormat);
    const expiryTime = this.parseDate(expiryTimeRaw, parserConfig.dateFormat);

    if (!startTime) {
      throw new Error(`Invalid start time "${startTimeRaw}" at row ${rowNum}`);
    }
    if (!expiryTime) {
      throw new Error(`Invalid expiry time "${expiryTimeRaw}" at row ${rowNum}`);
    }

    // Optional fields
    const siteIdentifier = mapping.siteIdentifier
      ? this.getColumnValue(row, mapping.siteIdentifier)
      : undefined;
    const externalReference = mapping.externalReference
      ? this.getColumnValue(row, mapping.externalReference)
      : undefined;

    return {
      vrm,
      amount,
      startTime,
      expiryTime,
      siteIdentifier: siteIdentifier || undefined,
      externalReference: externalReference || undefined,
      rawRow: row,
    };
  }

  private getColumnValue(row: any, columnName: string): string | undefined {
    // Try exact match first
    if (row[columnName] !== undefined) {
      return String(row[columnName]).trim();
    }

    // Try case-insensitive match
    const lowerColumnName = columnName.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lowerColumnName) {
        return String(row[key]).trim();
      }
    }

    return undefined;
  }

  private normalizeVrm(vrm: string): string | null {
    if (!vrm) return null;

    // Remove spaces, convert to uppercase
    const normalized = vrm.toUpperCase().replace(/[\s-]/g, '');

    // Basic UK VRM validation (simplified)
    if (normalized.length < 2 || normalized.length > 8) {
      return null;
    }

    // Check for valid characters (letters and numbers only)
    if (!/^[A-Z0-9]+$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private parseAmount(value: string | undefined): number | null {
    if (!value) return null;

    // Remove currency symbols and whitespace
    const cleaned = value.replace(/[£$€,\s]/g, '');

    const amount = parseFloat(cleaned);
    if (isNaN(amount) || amount < 0) {
      return null;
    }

    return amount;
  }

  private parseDate(value: string | undefined, format?: string): Date | null {
    if (!value) return null;

    // Try parsing with provided format
    if (format) {
      const parsed = this.parseDateWithFormat(value, format);
      if (parsed) return parsed;
    }

    // Try ISO format
    const isoDate = new Date(value);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    // Try common UK formats
    const ukFormats = [
      /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/, // DD/MM/YYYY HH:mm:ss
      /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/, // DD-MM-YYYY HH:mm:ss
    ];

    for (const regex of ukFormats) {
      const match = value.match(regex);
      if (match) {
        const [, day, month, year, hours, minutes, seconds] = match;
        const date = new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          hours ? parseInt(hours) : 0,
          minutes ? parseInt(minutes) : 0,
          seconds ? parseInt(seconds) : 0,
        );
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return null;
  }

  private parseDateWithFormat(value: string, format: string): Date | null {
    // Simple format parser for common patterns
    const formatMap: { [key: string]: RegExp } = {
      'DD/MM/YYYY HH:mm':
        /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/,
      'DD/MM/YYYY':
        /^(\d{2})\/(\d{2})\/(\d{4})$/,
      'YYYY-MM-DD HH:mm:ss':
        /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
      'YYYY-MM-DD':
        /^(\d{4})-(\d{2})-(\d{2})$/,
    };

    const regex = formatMap[format];
    if (!regex) return null;

    const match = value.match(regex);
    if (!match) return null;

    if (format.startsWith('DD')) {
      const [, day, month, year, hours, minutes] = match;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        hours ? parseInt(hours) : 0,
        minutes ? parseInt(minutes) : 0,
      );
    } else if (format.startsWith('YYYY')) {
      const [, year, month, day, hours, minutes, seconds] = match;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        hours ? parseInt(hours) : 0,
        minutes ? parseInt(minutes) : 0,
        seconds ? parseInt(seconds) : 0,
      );
    }

    return null;
  }
}
