import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { legalDoc } from "@/lib/legal";

const doc = legalDoc("privasi");

export const metadata: Metadata = {
  title: doc?.title ?? "Dokumen hukum",
  description: doc?.summary,
  robots: { index: false }, // masih DRAFT — jangan diindeks mesin pencari
};

export default function LegalDocPage() {
  if (!doc) notFound();
  return <Markdown>{doc.markdown}</Markdown>;
}
