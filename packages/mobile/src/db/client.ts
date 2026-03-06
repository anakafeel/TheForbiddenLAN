// DB client singleton for expo-sqlite.
// Call getDb() anywhere in the app to get the open database instance.
// The module initializes the schema on first access.

import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync('forbiddenlan.db');
    // Run schema once on first open — all statements are IF NOT EXISTS / INSERT OR IGNORE
    _db.execSync(SCHEMA_SQL);
  }
  return _db;
}
