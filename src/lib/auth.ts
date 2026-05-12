// Username ↔ email mapping for admin-only login.
// We store synthetic emails so Supabase auth keeps working without real email addresses.
export const USERNAME_EMAIL_DOMAIN = "mysunshine.local";

export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;

export const emailToUsername = (email: string | null | undefined) => {
  if (!email) return "";
  const [local, domain] = email.split("@");
  return domain === USERNAME_EMAIL_DOMAIN ? local : email;
};