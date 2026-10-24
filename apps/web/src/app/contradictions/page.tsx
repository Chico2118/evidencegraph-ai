import { ContradictionsView } from "./contradictions-view";
import { requireSetup } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export const metadata = { title: "Contradictions" };

// Detection is local and free, so only the topic gate applies (no model slot).
export default async function ContradictionsPage() {
  await requireSetup();
  return <ContradictionsView />;
}
