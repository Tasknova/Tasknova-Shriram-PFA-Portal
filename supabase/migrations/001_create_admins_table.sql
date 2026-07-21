-- Create admins table for admin authentication
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ
);

-- Create index on email for faster lookups
CREATE INDEX idx_admins_email ON public.admins(email);

-- Insert a default super admin (password: Tasknova@32)
-- Password hash for 'Tasknova@32' using bcrypt
INSERT INTO public.admins (full_name, email, password_hash, role)
VALUES (
    'Super Admin',
    'admin@tasknova.com',
    '$2a$10$LuHE7TKGyuNSyDd599KAWOklqIxSMfSj5hg53GtN0D.1MGpxCuG2O',
    'super_admin'
);

-- Enable RLS
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated access (handle via service role in practice)
CREATE POLICY "Allow authenticated admin access" ON public.admins
FOR ALL
USING (true);

COMMENT ON TABLE public.admins IS 'Admin users for the Tasknova admin panel';
