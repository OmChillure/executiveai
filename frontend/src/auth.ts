// /* eslint-disable @typescript-eslint/no-unsafe-assignment */
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "./db"
import { generateToken } from "./lib/jwt"

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    async redirect() {
      return "/chat"
    },
    session({ session, user }) {      
      if (session.user) {
        // Add user ID to the session
        session.user.id = user.id
        
        // Generate JWT token with user ID and email
        if (user.email) {
          session.user.token = generateToken(user.id, user.email)
        }
      }
      return session
    },
  },
  adapter: DrizzleAdapter(db),
})