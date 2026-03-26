import { NextRequest, NextResponse } from 'next/server'

const ADMIN_COOKIE_NAME = 'admin_auth'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  if (pathname.startsWith('/admin')) {
    const secret = process.env.ADMIN_SECRET
    const cookieValue = request.cookies.get(ADMIN_COOKIE_NAME)?.value

    if (!secret || cookieValue !== secret) {
      const loginUrl = new URL('/admin/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
