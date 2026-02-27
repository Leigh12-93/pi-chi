import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    GitHub({
      clientId: (process.env.GITHUB_CLIENT_ID || '').trim(),
      clientSecret: (process.env.GITHUB_CLIENT_SECRET || '').trim(),
      authorization: {
        params: {
          scope: 'repo read:user user:email',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token
        token.githubUsername = (profile as any)?.login || account.providerAccountId
      }
      return token
    },
    async session({ session, token }) {
      (session as any).accessToken = (token as any).accessToken
      (session as any).githubUsername = (token as any).githubUsername
      return session
    },
  },
})
