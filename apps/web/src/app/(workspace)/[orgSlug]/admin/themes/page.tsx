/**
 * /[orgSlug]/admin/themes — permanent redirect to the real themes route.
 *
 * The themes experience lives at /[orgSlug]/app/themes.
 * This route was incorrectly placed under /admin; themes are not an
 * admin-only concern and belong in the main app shell.
 * Any bookmark or stale link to /admin/themes is transparently forwarded.
 */
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ orgSlug: string }>;
}

export default async function AdminThemesRedirect({ params }: Props) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/app/themes`);
}
