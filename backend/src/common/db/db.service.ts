import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * DB Service - Wrapper for raw SQL execution with TypeORM connection pooling
 * Use this for dashboard queries that need optimal performance
 *
 * For CRUD operations, prefer TypeORM repositories and entities
 */
@Injectable()
export class DbService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Execute SQL and return a single row
   * @param sql - SQL query with positional parameters ($1, $2, etc.)
   * @param params - Array of parameter values
   * @returns Single row as typed object
   */
  async one<T>(sql: string, params: any[] = []): Promise<T> {
    const rows = await this.dataSource.query(sql, params);
    return rows[0] as T;
  }

  /**
   * Execute SQL and return multiple rows
   * @param sql - SQL query with positional parameters ($1, $2, etc.)
   * @param params - Array of parameter values
   * @returns Array of rows as typed objects
   */
  async many<T>(sql: string, params: any[] = []): Promise<T[]> {
    return this.dataSource.query(sql, params);
  }

  /**
   * Execute SQL and return scalar value (e.g., COUNT, SUM)
   * @param sql - SQL query returning single value
   * @param params - Array of parameter values
   * @returns Scalar value
   */
  async scalar<T = number>(sql: string, params: any[] = []): Promise<T> {
    const rows = await this.dataSource.query(sql, params);
    return rows[0]?.[Object.keys(rows[0])[0]] as T;
  }
}
