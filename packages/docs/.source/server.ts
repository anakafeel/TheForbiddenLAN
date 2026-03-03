// @ts-nocheck
import * as __fd_glob_4 from "../content/docs/infra/local-dev-bootstrap.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/guides/ui-development.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/guides/mobile-setup.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/guides/architecture.mdx?collection=docs"
import * as __fd_glob_0 from "../content/docs/index.mdx?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {}, {"index.mdx": __fd_glob_0, "guides/architecture.mdx": __fd_glob_1, "guides/mobile-setup.mdx": __fd_glob_2, "guides/ui-development.mdx": __fd_glob_3, "infra/local-dev-bootstrap.mdx": __fd_glob_4, });