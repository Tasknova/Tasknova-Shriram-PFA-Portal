import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Company Context Memory - Brain',
  description: 'Manage company brain context memories',
}

export default function CompanyContextMemoryRoute() {
  redirect('/admin/company-brain')
}
