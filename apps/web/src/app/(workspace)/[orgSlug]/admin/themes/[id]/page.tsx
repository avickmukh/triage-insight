/**
 * /[orgSlug]/admin/themes/[id] — permanent redirect to the real theme detail route.
 *
 * Theme detail lives at /[orgSlug]/app/themes/[id].
 * This stub is forwarded so no deep-link is ever a dead end.
 */
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ orgSlug: string; id: string }>;
}

export default async function AdminThemeDetailRedirect({ params }: Props) {
  const { orgSlug, id } = await params;
  redirect(`/${orgSlug}/app/themes/${id}`);
}
