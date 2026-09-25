import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { leadPrintData } from "@/lib/print-card-data";
import { PrintCardView } from "@/components/PrintCardView";

type Props = { params: Promise<{ id: string }> };

export default async function LeadPrintPage({ params }: Props) {
  const session = await readSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const data = await leadPrintData(session.workspaceId, id);
  if (!data) redirect("/leads");
  return <PrintCardView title={data.title} meta={data.meta} rows={data.rows} />;
}
