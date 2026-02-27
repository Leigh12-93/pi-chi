import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          // Request repo scope so user can create/push repos
          scope: 'repo read:user user:email',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Persist the GitHub access token in the JWT
      if (account) {
        token.accessToken = account.access_token
        token.githubUsername = account.providerAccountId
      }
      return token
    },
    async session({ session, token }) {
      // Expose access token and username to the client
      (session as any).accessToken = (token as any).accessToken
      (session as any).githubUsername = (token as any).githubUsername
      return session
    },
  },
})
