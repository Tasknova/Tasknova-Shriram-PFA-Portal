#!/usr/bin/env node

/**
 * Generate bcrypt password hash for admin user
 * Usage: node scripts/generate-password-hash.js [password]
 */

const bcrypt = require('bcryptjs')

const password = process.argv[2] || 'Admin@123'

if (!password) {
  console.error('Usage: node generate-password-hash.js <password>')
  process.exit(1)
}

bcrypt.hash(password, 10).then(hash => {
  console.log('\n✅ Password hash generated successfully!\n')
  console.log('Password:', password)
  console.log('Hash:', hash)
  console.log('\nCopy the hash above and use it in your SQL migration:')
  console.log(`
INSERT INTO public.admins (full_name, email, password_hash, role)
VALUES (
    'Super Admin',
    'admin@tasknova.com',
    '${hash}',
    'super_admin'
);
  `)
}).catch(err => {
  console.error('Error generating hash:', err)
  process.exit(1)
})
