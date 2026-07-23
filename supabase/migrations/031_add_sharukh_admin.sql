-- Migration: Add new admin user sharukh.qureshi@viztarbusinesssolutions.com
-- Run this in Supabase Dashboard > SQL Editor

INSERT INTO public.admins (full_name, email, password_hash, role)
VALUES (
    'Sharukh Qureshi',
    'sharukh.qureshi@viztarbusinesssolutions.com',
    '$2a$10$OqBll5wgblKa7.c6UitPXuk2BUjWhp8lcEq98toiLfZUTwOoZvgfW', -- Hash for 'sharukh@123'
    'super_admin'
)
ON CONFLICT (email) DO NOTHING;
