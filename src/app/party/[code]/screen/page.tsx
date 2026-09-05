import Stage from "@/components/party/Stage";

export const metadata = { title: "Party screen — DoodleDisaster" };

export default async function StagePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <Stage code={code.toUpperCase()} />;
}
