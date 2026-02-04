export const ENV = {
  appId:
    process.env.VITE_APP_ID ??
    process.env.APP_ID ??
    process.env.GOOGLE_CLIENT_ID ??
    process.env.VITE_GOOGLE_CLIENT_ID ??
    "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  gmailClientId: process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
  gmailClientSecret: process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
  gmailRedirectUri: process.env.GMAIL_REDIRECT_URI ?? "",
};
