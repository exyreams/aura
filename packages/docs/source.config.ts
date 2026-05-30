import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { z } from "zod";

// Single unified collection — all sections are root folders in the page tree.
// Fumadocs renders root folders as Layout Tabs (dropdown) automatically.
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    // `status` powers the sidebar badge plugin (e.g. `status: new`).
    schema: pageSchema.extend({ status: z.string().optional() }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
});
