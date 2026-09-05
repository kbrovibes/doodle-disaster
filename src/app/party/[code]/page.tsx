import Remote from "@/components/party/Remote";

export const metadata = { title: "Party remote — DoodleDisaster" };

export default async function RemotePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <Remote code={code.toUpperCase()} />;
}
