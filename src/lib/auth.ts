import { apiFetch, clearToken, getToken, setToken } from "./http";

export type UserProfileSeed = {
  companyName: string;
  ico: string;
  dic: string;
  address: string;
};

export type UserRole = "admin" | "user";

export type AppUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  profile: UserProfileSeed;
  createdAt: string;
};

type AuthResponse = { token: string; user: AppUser };
type MeResponse = { user: AppUser };
type UsersResponse = { users: AppUser[] };

export function getSessionUserId(): string | null {
  // Kept for callers that only need a presence check; source of truth is JWT + /me.
  return getToken() ? "session" : null;
}

export function clearSession(): void {
  clearToken();
}

export async function fetchSessionUser(): Promise<AppUser | null> {
  if (!getToken()) return null;
  try {
    const data = await apiFetch<MeResponse>("/api/auth/me");
    return data.user;
  } catch {
    clearToken();
    return null;
  }
}

export async function registerUser(input: {
  fullName: string;
  email: string;
  password: string;
  profile?: Partial<UserProfileSeed>;
}): Promise<AppUser> {
  const data = await apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    auth: false,
    body: {
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      profile: input.profile,
    },
  });
  setToken(data.token);
  return data.user;
}

export async function loginUser(email: string, password: string): Promise<AppUser> {
  const data = await apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
  setToken(data.token);
  return data.user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch<{ ok: boolean }>("/api/auth/password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}

export async function listUsers(): Promise<AppUser[]> {
  const data = await apiFetch<UsersResponse>("/api/users");
  return data.users;
}

export async function inviteUser(input: {
  fullName: string;
  email: string;
  password: string;
  role?: UserRole;
  profile?: Partial<UserProfileSeed>;
}): Promise<AppUser> {
  const data = await apiFetch<{ user: AppUser }>("/api/users", {
    method: "POST",
    body: {
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      role: input.role,
      profile: input.profile,
    },
  });
  return data.user;
}

export async function deleteUser(userId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/users/${userId}`, { method: "DELETE" });
}

export async function updateUserRole(userId: string, role: UserRole): Promise<AppUser> {
  const data = await apiFetch<{ user: AppUser }>(`/api/users/${userId}/role`, {
    method: "PATCH",
    body: { role },
  });
  return data.user;
}
