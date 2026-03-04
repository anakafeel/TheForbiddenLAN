import { source } from "@/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";

export default function DocLayout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} nav={{ title: "SkyTalk Docs" }}>
      {children}
    </DocsLayout>
  );
}
