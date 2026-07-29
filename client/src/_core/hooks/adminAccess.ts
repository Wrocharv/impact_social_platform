export type AdminUserLike = {
  role?: string | null;
  openId?: string | null;
  email?: string | null;
};

export function isAdminUser(user: AdminUserLike | null | undefined, adminEmails: string[] = []) {
  if (!user) return false;

  const normalizedEmail = user.email?.trim().toLowerCase();
  const isAdminByEmail = Boolean(normalizedEmail && adminEmails.includes(normalizedEmail));

  return user.role === "admin" || isAdminByEmail;
}
