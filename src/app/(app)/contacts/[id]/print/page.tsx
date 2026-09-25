import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { contactPrintData } from "@/lib/print-card-data";
import { PrintCardView } from "@/components/PrintCardView";

type Props = { params: Promise<{ id: string }> };

export default async function ContactPrintPage({ params }: Props) {
  const session = await readSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const data = await contactPrintData(session.workspaceId, id);
  if (!data) redirect("/inbox");
  return <PrintCardView title={data.title} meta={data.meta} rows={data.rows} />;
}
