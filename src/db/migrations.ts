/**
 * Repeatable Database Migrations & DDL Definitions
 */

import Database from 'better-sqlite3';

export const SCHEMA_V1 = `
-- 1. Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  original_filename TEXT NOT NULL,
  sanitized_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  uploaded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  processing_duration_ms INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  raw_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);

-- 2. Extractions Table (Decimal-safe with integer cents)
CREATE TABLE IF NOT EXISTS extractions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE,
  invoice_number TEXT,
  invoice_date TEXT,
  supplier_name TEXT,
  customer_name TEXT,
  subtotal REAL,
  subtotal_cents INTEGER,
  tax REAL,
  tax_cents INTEGER,
  total REAL,
  total_cents INTEGER,
  currency TEXT,
  line_items_json TEXT,
  evidence_json TEXT,
  extraction_metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_extractions_supplier_invoice ON extractions(supplier_name, invoice_number);
CREATE INDEX IF NOT EXISTS idx_extractions_invoice_date ON extractions(invoice_date);
CREATE INDEX IF NOT EXISTS idx_extractions_total_cents ON extractions(total_cents);

-- 3. Validations Table
CREATE TABLE IF NOT EXISTS validations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  error_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  is_reconciled INTEGER NOT NULL DEFAULT 0,
  issues_json TEXT,
  reconciliation_json TEXT,
  validated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 4. Processing History Table
CREATE TABLE IF NOT EXISTS processing_history (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_document ON processing_history(document_id, attempt_number);

-- 5. Audit Trail Table
CREATE TABLE IF NOT EXISTS audit_trail (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  field TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  reason TEXT,
  author TEXT NOT NULL DEFAULT 'auditor',
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_document ON audit_trail(document_id);

-- 6. Schema Migrations Version Tracker
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

export function runMigrations(db: Database.Database): void {
  // Execute base DDL in a transaction
  db.exec(SCHEMA_V1);

  const stmt = db.prepare('SELECT version FROM schema_migrations WHERE version = 1');
  const existing = stmt.get();

  if (!existing) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(
      new Date().toISOString()
    );
  }
}
