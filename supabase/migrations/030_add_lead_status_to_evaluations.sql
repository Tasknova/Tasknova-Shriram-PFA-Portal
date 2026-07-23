-- Migration: Add lead status fields to ai_evaluations table
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE ai_evaluations
  ADD COLUMN IF NOT EXISTS lead_status TEXT,
  ADD COLUMN IF NOT EXISTS meeting_datetime TEXT,
  ADD COLUMN IF NOT EXISTS meeting_location TEXT;
