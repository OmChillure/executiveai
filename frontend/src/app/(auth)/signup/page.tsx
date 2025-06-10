"use client"

import type React from "react"

import { useState } from "react"
import { signIn } from "next-auth/react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { Separator } from "@/components/ui/seperator"

export default function AuthPage() {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true)
    try {
      await signIn("google", {
        callbackUrl: "/chat",
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
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.ok) {
        window.location.href = "/chat"
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
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2 bg-black">
      <div className="relative hidden lg:block rounded-l-lg overflow-hidden">
        <Image
          src="/singupbg.webp"
          alt="Nature background with stairs leading down to a river"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 flex items-end p-16 text-white bg-gradient-to-t from-black/60 to-transparent">
          <h1 className="text-4xl font-bold leading-tight">Explore what nature has to offer</h1>
        </div>
      </div>

      <div className="flex flex-col justify-center p-8 lg:p-16 bg-black bg-[url('/grid-pattern.svg')] bg-repeat">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-8 flex justify-center">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-black"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
              </svg>
            </div>
          </div>

          <h2 className="text-white text-3xl font-bold mb-2 text-center">Welcome to Onara AI</h2>
          <p className="text-neutral-400 mb-8 text-center text-sm">Log in or sign up</p>

          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full h-12 font-medium bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800 transition-colors rounded-lg"
            >
              {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
              {isGoogleLoading ? "Connecting..." : "Continue with Google"}
            </Button>

          </div>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full border-neutral-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-black px-2 text-neutral-500">/</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Input
                type="email"
                name="email"
                placeholder="Email"
                required
                className="h-12 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 rounded-lg"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Input
                name="password"
                placeholder="Password"
                required
                className="h-12 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 rounded-lg"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 text-base font-medium bg-white text-black hover:bg-neutral-200 transition-colors rounded-lg"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Logging in..." : "Log in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
