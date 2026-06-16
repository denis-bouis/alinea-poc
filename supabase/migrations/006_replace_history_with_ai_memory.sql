ALTER TABLE alineas DROP COLUMN IF EXISTS conversation_history;
ALTER TABLE alineas ADD COLUMN IF NOT EXISTS ai_memory TEXT;
