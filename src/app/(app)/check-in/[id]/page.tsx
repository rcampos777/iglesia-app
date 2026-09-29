import { redirect } from "next/navigation";

/** Enlaces antiguos a un servicio: ahora todo vive en /check-in. */
export default async function ServiceCheckinRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/check-in?culto=${encodeURIComponent(id)}`);
}
