import { defineStore } from "pinia";
import { ref } from "vue";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  organization: { id: string; name: string; slug: string };
}

interface AuthResponse { accessToken: string; user: SessionUser; }

async function authRequest(path: string, payload?: Record<string, string>, accessToken?: string) {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  const result = await response.json() as { success: boolean; data?: AuthResponse; error?: { message?: string } };
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error?.message ?? "The request could not be completed.");
  }
  return result.data;
}

export const useAuthStore = defineStore("auth", () => {
  const accessToken = ref<string | null>(null);
  const user = ref<SessionUser | null>(null);
  const ready = ref(false);
  const busy = ref(false);

  function acceptSession(data: AuthResponse) {
    accessToken.value = data.accessToken;
    user.value = data.user;
  }

  async function login(input: { organizationSlug: string; email: string; password: string }) {
    busy.value = true;
    try { acceptSession(await authRequest("login", input)); }
    finally { busy.value = false; }
  }

  async function register(input: { organizationName: string; organizationSlug: string; name: string; email: string; password: string }) {
    busy.value = true;
    try { acceptSession(await authRequest("register", input)); }
    finally { busy.value = false; }
  }

  async function restore() {
    try { acceptSession(await authRequest("refresh")); }
    catch { accessToken.value = null; user.value = null; }
    finally { ready.value = true; }
  }

  async function logout() {
    try { await authRequest("logout"); }
    finally { accessToken.value = null; user.value = null; }
  }

  return { accessToken, user, ready, busy, login, register, restore, logout };
});
