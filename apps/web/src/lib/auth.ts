import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { LoginRequest, PlatformRole, SignUpDto, User, WorkspaceRole } from "@/lib/api-types";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "next/navigation";

const USER_QUERY_KEY = "user";

export const useAuth = () => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading, isError } = useQuery<User, Error>({
    queryKey: [USER_QUERY_KEY, "me"],
    queryFn: apiClient.auth.getMe,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1, // Don't retry endlessly if unauthenticated
  });

  const { mutate: signUp } = useMutation({
    mutationFn: (data: SignUpDto) => apiClient.auth.signUp(data),
    onSuccess: (data) => {
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      queryClient.invalidateQueries({ queryKey: [USER_QUERY_KEY] });
      router.push("/admin/feedback");
    },
  });

  const { mutate: login } = useMutation({
    mutationFn: (data: LoginRequest) => apiClient.auth.login(data),
   onSuccess: async (data) => {
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);

      // Fetch the user immediately
      const user = await apiClient.auth.getMe();

      queryClient.setQueryData([USER_QUERY_KEY, "me"], user);
      router.push("/admin/feedback");
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


