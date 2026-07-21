-- Add content_text column to store extracted text from documents
-- This allows AI to search within document content

ALTER TABLE project_documents
ADD COLUMN IF NOT EXISTS content_text TEXT;

COMMENT ON COLUMN project_documents.content_text IS 'Extracted text content from the document for AI search and embeddings';
