/**
 * Database Connection Module
 *
 * Creates and manages the SQLite database connection.
 * Uses better-sqlite3 for synchronous, fast database operations.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { dbLogger } from '../utils/logger';

// Module-level database instance
let db: Database.Database | null = null;

/**
 * Initialize the database connection
 *
 * @param dbPath - Path to the SQLite database file
 * @returns The database instance
 */
export function initializeDatabase(dbPath: string): Database.Database {
  // Ensure the directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    dbLogger.debug(`Created directory: ${dir}`);
  }

  // Create database connection
  db = new Database(dbPath);

  // Enable WAL mode for better performance (concurrent reads while writing)
  db.pragma('journal_mode = WAL');

  // Enable foreign key constraints for data integrity
  db.pragma('foreign_keys = ON');

  dbLogger.info(`Connected to database: ${dbPath}`);

  return db;
}

/**
 * Get the database instance
 *
 * @throws Error if database is not initialized
 * @returns The database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error(
      'Database not initialized. Call initializeDatabase() first.'
    );
  }
  return db;
}

/**
 * Close the database connection gracefully
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    dbLogger.info('Database connection closed');
  }
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return db !== null;
}

