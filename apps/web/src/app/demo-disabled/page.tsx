import Link from "next/link";

export const metadata = { title: "Not available in the demo" };

// Shown (via middleware rewrite) in place of screens that are turned off in the read-only public demo.
export default function DemoDisabledPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">Public demo</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Not available in the demo</h1>
      <p className="mt-4 text-muted-foreground">
        This copy of EvidenceGraph AI is a read-only demo with synthetic data. Settings, workspaces, chats and anything that
        saves or changes data are turned off. Run the project locally to use those.
      </p>
      <p className="mt-6">
        <Link href="/" className="underline underline-offset-2 hover:text-foreground">
          Back to the demo
        </Link>
      </p>
    </div>
  );
}
