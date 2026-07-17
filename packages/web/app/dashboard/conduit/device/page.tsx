import { redirect } from "next/navigation";

export default async function DashboardConduitDeviceRedirect({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const code = params.code?.trim();

  redirect(
    code
      ? `/conduit/authorize?code=${encodeURIComponent(code)}`
      : "/conduit/authorize",
  );
}
