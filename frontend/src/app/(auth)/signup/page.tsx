"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/seperator"
import { Loader2, LockIcon } from "lucide-react"
import Image from "next/image"

export default function AuthBasic() {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true)
    try {
      await signIn('google', {
        callbackUrl: '/chat',
        redirect: true,
      })
    } catch (error) {
      console.error("Google sign-in error:", error)
      setIsGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.target as HTMLFormElement)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      
      if (result?.ok) {
        window.location.href = '/chat'
      } else {
        console.error("Authentication error:", result?.error)
      }
    } catch (error) {
      console.error("Authentication error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  function GoogleIcon() {
    return (
      <svg
        className="mr-2 h-4 w-4"
        aria-hidden="true"
        focusable="false"
        data-prefix="fab"
        data-icon="google"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 488 512"
      >
        <path
          fill="currentColor"
          d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
        ></path>
      </svg>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="w-full max-w-[450px]">
        <div className="w-full h-48 relative mb-4">
          <Image
            src="https://ferf1mheo22r9ira.public.blob.vercel-storage.com/to-the-moon-u5UJD9sRK8WkmaTY8HdEsNKjAQ9bjN.svg"
            alt="Background Image"
            fill
            className="object-cover"
          />
        </div>
        <Card className="w-full shadow-lg bg-black border border-neutral-800">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight text-white">
              Welcome back
            </CardTitle>
            <CardDescription className="text-neutral-400">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Button
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full h-12 font-medium border border-neutral-700 bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
            >
              {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
              {isGoogleLoading ? "Connecting..." : "Sign in with Google"}
            </Button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full border-neutral-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-black px-2 text-neutral-400">Or continue with</span>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-black/30 backdrop-blur-lg z-10 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="bg-neutral-800 px-4 py-2 rounded-full border border-neutral-700">
                    <span className="text-white text-sm font-medium">Coming Soon</span>
                  </div>
                </div>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4 opacity-40" noValidate>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-white">
                    Email
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 flex items-center justify-center w-4 h-4">
                      @
                    </span>
                    <Input
                      type="email"
                      name="email"
                      placeholder="name@example.com"
                      required
                      disabled
                      className="pl-10 h-12 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Password</label>
                  <div className="relative">
                    <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      type="password"
                      name="password"
                      placeholder="Enter your password"
                      required
                      disabled
                      className="pl-10 h-12 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled
                  className="w-full h-12 text-base font-medium bg-white text-black hover:bg-neutral-200 transition-colors"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}