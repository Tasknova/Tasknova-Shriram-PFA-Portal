import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Project Context Memory - Brain',
  description: 'Manage project brain context memories',
}

export default function ProjectContextMemoryRoute() {
  redirect('/admin/project-brain')
}
