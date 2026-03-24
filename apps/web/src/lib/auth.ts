import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { LoginRequest, SignUpDto, User } from "@/lib/api-types";
import { useRouter } from "next/navigation";
import { setTokens, clearTokens } from "@/lib/token-storage";
import { hashPasswordForTransmission } from "@/lib/password-hash";

const USER_QUERY_KEY = "user";

/**
 * After login/signup we redirect to /:orgSlug/app (the workspace dashboard).
 * The orgSlug comes from the workspace returned by GET /workspace/current.
 * If the slug is not yet available we fall back to /activation.
 */
async function resolvePostLoginRedirect(): Promise<string> {
  try {
    const ws = await apiClient.workspace.getCurrent();
    if (ws?.slug) return `/${ws.slug}/app`;
  } catch {
    // workspace not yet available
  }
  return '/activation';
}

export const useAuth = () => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading, isError } = useQuery<User, Error>({
    queryKey: [USER_QUERY_KEY, "me"],
    queryFn: apiClient.auth.getMe,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const signUpMutation = useMutation({
    mutationFn: async (data: SignUpDto) => {
      // Hash the password with SHA-256 before transmission.
      // The server receives a hex hash — the raw password never leaves the browser.
      const hashedPassword = await hashPasswordForTransmission(data.password);
      return apiClient.auth.signUp({ ...data, password: hashedPassword });
    },
    onSuccess: async (data) => {
      // Write to both localStorage (Axios interceptor) and cookie (middleware)
      setTokens(data.accessToken, data.refreshToken);
      queryClient.invalidateQueries({ queryKey: [USER_QUERY_KEY] });
      const dest = await resolvePostLoginRedirect();
      router.push(dest);
    },
  });
  // Expose as an async function so callers can await and catch server errors
  const signUp = (data: SignUpDto) => signUpMutation.mutateAsync(data);

  const { mutate: login } = useMutation({
    mutationFn: async (data: LoginRequest) => {
      // Hash the password with SHA-256 before transmission.
      const hashedPassword = await hashPasswordForTransmission(data.password);
      return apiClient.auth.login({ ...data, password: hashedPassword });
    },
    onSuccess: async (data) => {
      // Write to both localStorage (Axios interceptor) and cookie (middleware)
      setTokens(data.accessToken, data.refreshToken);
      queryClient.invalidateQueries({ queryKey: [USER_QUERY_KEY] });
      const dest = await resolvePostLoginRedirect();
      router.push(dest);
    },
  });

  const logout = () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      apiClient.auth.logout({ refreshToken });
    }
    // Clear both localStorage and the cookie
    clearTokens();
    queryClient.setQueryData([USER_QUERY_KEY, "me"], null);
    router.push("/login");
  };

  return { user, isLoading, isError, signUp, login, logout };
};
