import { Suspense } from 'react'
import LoginForm from './LoginForm'

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1">
            Weekly Report
          </p>
          <h1 className="text-xl font-bold text-zinc-100">Admin 로그인</h1>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-xs text-zinc-600 text-center mt-6">
          ADMIN_SECRET 토큰으로 인증합니다.
        </p>
      </div>
    </div>
  )
}
