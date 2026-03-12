CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS assets (
  asset_id TEXT PRIMARY KEY,
  asset_type TEXT,
  location TEXT,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS failure_modes (
  id SERIAL PRIMARY KEY,
  name TEXT,
  description TEXT,
  indicators JSONB,
  severity_score FLOAT
);

CREATE TABLE IF NOT EXISTS sop_steps (
  id SERIAL PRIMARY KEY,
  sop_name TEXT,
  step_number INT,
  instruction TEXT,
  asset_type TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  asset_id TEXT REFERENCES assets(asset_id),
  timestamp TIMESTAMP,
  failure_mode TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  downtime_minutes FLOAT,
  source_dataset_id TEXT,
  notes TEXT,
  resolved BOOLEAN,
  raw_payload JSONB
);

CREATE TABLE IF NOT EXISTS corrective_actions (
  id SERIAL PRIMARY KEY,
  action TEXT,
  success_rate FLOAT
);

CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id SERIAL PRIMARY KEY,
  source TEXT,
  content TEXT,
  embedding VECTOR(1536)
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id SERIAL PRIMARY KEY,
  asset_id TEXT,
  source_type TEXT,
  source_value TEXT,
  target_type TEXT,
  target_value TEXT,
  weight FLOAT DEFAULT 1.0,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  endpoint TEXT,
  query_text TEXT,
  response_summary TEXT,
  evidence_count INT,
  confidence_score FLOAT,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS knowledge_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_chat_memory (
  id SERIAL PRIMARY KEY,
  session_id TEXT,
  asset_id TEXT,
  role TEXT,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_saved_datasets (
  dataset_id TEXT PRIMARY KEY,
  source TEXT,
  filename TEXT,
  asset_ids JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
