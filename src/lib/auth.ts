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
  password: string;
  role: UserRole;
  profile: UserProfileSeed;
  createdAt: string;
};

const LS_USERS = "fakturujto_users_v1";
const LS_SESSION = "fakturujto_auth_session_v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function listUsers(): AppUser[] {
  if (!canUseStorage()) return [];
  const raw = localStorage.getItem(LS_USERS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const users = parsed
      .map((x): AppUser | null => {
        if (!x || typeof x !== "object") return null;
        const r = x as Record<string, unknown>;
        if (typeof r.id !== "string" || typeof r.email !== "string") return null;
        return {
          id: r.id,
          fullName: typeof r.fullName === "string" ? r.fullName : "",
          email: r.email,
          password: typeof r.password === "string" ? r.password : "",
          role: r.role === "admin" ? "admin" : "user",
          profile: {
            companyName: typeof (r.profile as Record<string, unknown> | undefined)?.companyName === "string" ? ((r.profile as Record<string, unknown>).companyName as string) : "",
            ico: typeof (r.profile as Record<string, unknown> | undefined)?.ico === "string" ? ((r.profile as Record<string, unknown>).ico as string) : "",
            dic: typeof (r.profile as Record<string, unknown> | undefined)?.dic === "string" ? ((r.profile as Record<string, unknown>).dic as string) : "",
            address:
              typeof (r.profile as Record<string, unknown> | undefined)?.address === "string"
                ? ((r.profile as Record<string, unknown>).address as string)
                : "",
          },
          createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
        };
      })
      .filter((u): u is AppUser => u != null);

    if (users.length > 0 && !users.some((u) => u.role === "admin")) {
      users[0] = { ...users[0], role: "admin" };
      saveUsers(users);
    }

    return users;
  } catch {
    return [];
  }
}

function saveUsers(users: AppUser[]): void {
  if (!canUseStorage()) return;
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}

export function createUser(input: {
  fullName: string;
  email: string;
  password: string;
  role?: UserRole;
  profile?: Partial<UserProfileSeed>;
}): AppUser {
  const email = input.email.trim().toLowerCase();
  const users = listUsers();
  if (users.some((u) => u.email.toLowerCase() === email)) {
    throw new Error("Uživatel s tímto e-mailem již existuje.");
  }
  const next: AppUser = {
    id: crypto.randomUUID(),
    fullName: input.fullName.trim(),
    email,
    password: input.password,
    role: input.role ?? (users.length === 0 ? "admin" : "user"),
    profile: {
      companyName: input.profile?.companyName?.trim() || "",
      ico: input.profile?.ico?.trim() || "",
      dic: input.profile?.dic?.trim() || "",
      address: input.profile?.address?.trim() || "",
    },
    createdAt: new Date().toISOString(),
  };
  users.push(next);
  saveUsers(users);
  return next;
}

export function authenticateUser(email: string, password: string): AppUser {
  const em = email.trim().toLowerCase();
  const user = listUsers().find((u) => u.email.toLowerCase() === em && u.password === password);
  if (!user) throw new Error("Neplatný e-mail nebo heslo.");
  return user;
}

export function deleteUser(userId: string): void {
  const users = listUsers();
  const left = users.filter((u) => u.id !== userId);
  if (left.length > 0 && !left.some((u) => u.role === "admin")) {
    left[0] = { ...left[0], role: "admin" };
  }
  saveUsers(left);
}

export function updateUserRole(userId: string, role: UserRole): void {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) throw new Error("Uživatel nenalezen.");
  const updated = [...users];
  updated[idx] = { ...updated[idx], role };
  if (!updated.some((u) => u.role === "admin")) {
    throw new Error("V systému musí zůstat alespoň jeden administrátor.");
  }
  saveUsers(updated);
}

export function updatePasswordForUser(userId: string, newPassword: string): void {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) throw new Error("Uživatel nenalezen.");
  users[idx] = { ...users[idx], password: newPassword };
  saveUsers(users);
}

export function resetPasswordByEmail(email: string, newPassword: string): void {
  const em = email.trim().toLowerCase();
  const users = listUsers();
  const idx = users.findIndex((u) => u.email.toLowerCase() === em);
  if (idx < 0) throw new Error("Uživatel s tímto e-mailem neexistuje.");
  users[idx] = { ...users[idx], password: newPassword };
  saveUsers(users);
}

export function getSessionUserId(): string | null {
  if (!canUseStorage()) return null;
  const raw = localStorage.getItem(LS_SESSION);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: string };
    return typeof parsed.userId === "string" && parsed.userId.length > 0 ? parsed.userId : null;
  } catch {
    return null;
  }
}

export function setSessionUserId(userId: string): void {
  if (!canUseStorage()) return;
  localStorage.setItem(LS_SESSION, JSON.stringify({ userId }));
}

export function clearSession(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(LS_SESSION);
}

export function getSessionUser(): AppUser | null {
  const id = getSessionUserId();
  if (!id) return null;
  return listUsers().find((u) => u.id === id) ?? null;
}

