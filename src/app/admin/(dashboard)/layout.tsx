'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  FileText, 
  MessageSquare, 
  Phone, 
  Briefcase, 
  Users, 
  BookOpen, 
  Library, 
  FileCheck,
  Shield,
  LogOut,
  Menu,
  X,
  Brain,
  FolderKanban,
  ClipboardList,
  BrainCircuit,
  Wand2,
  PhoneCall
} from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'AI Calling Agents', href: '/admin/ai-calling-agents', icon: Wand2 },
  { name: 'C2C Calling', href: '/admin/c2c-calling', icon: PhoneCall },
  { name: 'Admins', href: '/admin/admins', icon: Shield },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      toast.success('Logged out successfully')
      router.push('/admin/login')
      router.refresh()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Logout failed')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col bg-white shadow-xl border-r border-gray-200">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4 mb-8">
            <div className="flex items-center gap-3">
              <Image
                src="/tasknova-logo-2.png"
                alt="Tasknova Logo"
                width={180}
                height={40}
                priority
              />
            </div>
          </div>

          <nav className="flex-1 px-3 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-300
                    ${isActive
                      ? 'bg-gradient-to-r from-primary-500 to-purple-500 text-white shadow-lg transform scale-105'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <item.icon className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'}`} />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          <div className="px-3 mt-4 border-t border-gray-200 pt-4">
            <button
              onClick={handleLogout}
              className="w-full group flex items-center px-3 py-3 text-sm font-medium rounded-xl text-gray-700 hover:bg-red-50 hover:text-red-600 transition-all duration-300"
            >
              <LogOut className="mr-3 h-5 w-5 text-gray-500 group-hover:text-red-600" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/tasknova-logo-2.png"
              alt="Tasknova Logo"
              width={140}
              height={32}
              priority
            />
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-white pt-16 animate-slide-in-down">
          <nav className="px-4 py-4 space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-300
                    ${isActive
                      ? 'bg-gradient-to-r from-primary-500 to-purple-500 text-white shadow-lg'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <item.icon className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                  {item.name}
                </Link>
              )
            })}
            <div className="border-t border-gray-200 my-4"></div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl text-gray-700 hover:bg-red-50 hover:text-red-600 transition-all duration-300"
            >
              <LogOut className="mr-3 h-5 w-5 text-gray-500" />
              Logout
            </button>
          </nav>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-64 pt-16 lg:pt-0">
        <main className="py-8 px-4 sm:px-6 lg:px-8 min-h-screen">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}



