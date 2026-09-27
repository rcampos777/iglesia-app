import { ActivateForm } from "./activate-form";

export default async function ActivatePortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;

  return <ActivateForm token={token ?? ""} defaultEmail={email ?? ""} />;
}
