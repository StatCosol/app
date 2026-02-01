import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();
import { DataSource } from 'typeorm';
import path from 'node:path';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  // Keep these aligned with the Nest configuration.
  synchronize: false,
  entities: [path.join(__dirname, '/**/*.entity{.ts,.js}')],
  // Disable TypeORM-managed migrations; using SQL files in /migrations instead.
  migrations: [],
});
