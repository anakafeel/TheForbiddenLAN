// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "guides/architecture.mdx": () => import("../content/docs/guides/architecture.mdx?collection=docs"), "guides/mobile-setup.mdx": () => import("../content/docs/guides/mobile-setup.mdx?collection=docs"), "guides/ui-development.mdx": () => import("../content/docs/guides/ui-development.mdx?collection=docs"), "infra/local-dev-bootstrap.mdx": () => import("../content/docs/infra/local-dev-bootstrap.mdx?collection=docs"), }),
};
export default browserCollections;