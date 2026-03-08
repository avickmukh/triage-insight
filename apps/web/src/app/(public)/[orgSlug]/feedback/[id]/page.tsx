export default async function Page({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { id } = await params;
  return <h1>Feedback Detail: {id}</h1>;
}
