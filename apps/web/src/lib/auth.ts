import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { LoginRequest, SignUpDto, User } from "@/lib/api-types";
import { useRouter } from "next/navigation";

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

  const { mutate: signUp } = useMutation({
    mutationFn: (data: SignUpDto) => apiClient.auth.signUp(data),
    onSuccess: async (data) => {
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      queryClient.invalidateQueries({ queryKey: [USER_QUERY_KEY] });
      const dest = await resolvePostLoginRedirect();
      router.push(dest);
    },
  });

  const { mutate: login } = useMutation({
    mutationFn: (data: LoginRequest) => apiClient.auth.login(data),
    onSuccess: async (data) => {
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
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
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    queryClient.setQueryData([USER_QUERY_KEY, "me"], null);
    router.push("/login");
  };

  return { user, isLoading, isError, signUp, login, logout };
};
