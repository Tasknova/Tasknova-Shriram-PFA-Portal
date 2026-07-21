import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySession } from './lib/auth'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Skip middleware for API routes
  if (path.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Public paths
  if (path === '/admin/login') {
    const token = request.cookies.get('admin_session')?.value

    if (token && (await verifySession(token))) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }

    return NextResponse.next()
  }

  // Protected admin paths
  if (path.startsWith('/admin')) {
    const token = request.cookies.get('admin_session')?.value

    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const session = await verifySession(token)

    if (!session) {
      const response = NextResponse.redirect(new URL('/admin/login', request.url))
      response.cookies.delete('admin_session')
      return response
    }

    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
