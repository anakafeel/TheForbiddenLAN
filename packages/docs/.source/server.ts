// @ts-nocheck
import * as __fd_glob_33 from "../content/docs/ui-ux/web-portal-ux.mdx?collection=docs"
import * as __fd_glob_32 from "../content/docs/ui-ux/mobile-app-ux.mdx?collection=docs"
import * as __fd_glob_31 from "../content/docs/ui-ux/design-philosophy.mdx?collection=docs"
import * as __fd_glob_30 from "../content/docs/stack-and-tradeoffs/transport.mdx?collection=docs"
import * as __fd_glob_29 from "../content/docs/stack-and-tradeoffs/mobile.mdx?collection=docs"
import * as __fd_glob_28 from "../content/docs/stack-and-tradeoffs/infrastructure.mdx?collection=docs"
import * as __fd_glob_27 from "../content/docs/stack-and-tradeoffs/backend.mdx?collection=docs"
import * as __fd_glob_26 from "../content/docs/runbook/troubleshooting.mdx?collection=docs"
import * as __fd_glob_25 from "../content/docs/runbook/local-development.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/runbook/deployment.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/infrastructure/environment.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/infrastructure/deployment.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/infrastructure/database-schema.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/infra/local-dev-bootstrap.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/guides/ui-development.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/guides/mobile-setup.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/guides/architecture.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/architecture/satellite-constraints.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/architecture/key-management.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/architecture/index.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/architecture/floor-control.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/api-reference/websocket-protocol.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/api-reference/talkgroups.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/api-reference/devices.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/api-reference/authentication.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/getting-started.mdx?collection=docs"
import { default as __fd_glob_6 } from "../content/docs/ui-ux/meta.json?collection=docs"
import { default as __fd_glob_5 } from "../content/docs/stack-and-tradeoffs/meta.json?collection=docs"
import { default as __fd_glob_4 } from "../content/docs/runbook/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/infrastructure/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/architecture/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/api-reference/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "api-reference/meta.json": __fd_glob_1, "architecture/meta.json": __fd_glob_2, "infrastructure/meta.json": __fd_glob_3, "runbook/meta.json": __fd_glob_4, "stack-and-tradeoffs/meta.json": __fd_glob_5, "ui-ux/meta.json": __fd_glob_6, }, {"getting-started.mdx": __fd_glob_7, "index.mdx": __fd_glob_8, "api-reference/authentication.mdx": __fd_glob_9, "api-reference/devices.mdx": __fd_glob_10, "api-reference/talkgroups.mdx": __fd_glob_11, "api-reference/websocket-protocol.mdx": __fd_glob_12, "architecture/floor-control.mdx": __fd_glob_13, "architecture/index.mdx": __fd_glob_14, "architecture/key-management.mdx": __fd_glob_15, "architecture/satellite-constraints.mdx": __fd_glob_16, "guides/architecture.mdx": __fd_glob_17, "guides/mobile-setup.mdx": __fd_glob_18, "guides/ui-development.mdx": __fd_glob_19, "infra/local-dev-bootstrap.mdx": __fd_glob_20, "infrastructure/database-schema.mdx": __fd_glob_21, "infrastructure/deployment.mdx": __fd_glob_22, "infrastructure/environment.mdx": __fd_glob_23, "runbook/deployment.mdx": __fd_glob_24, "runbook/local-development.mdx": __fd_glob_25, "runbook/troubleshooting.mdx": __fd_glob_26, "stack-and-tradeoffs/backend.mdx": __fd_glob_27, "stack-and-tradeoffs/infrastructure.mdx": __fd_glob_28, "stack-and-tradeoffs/mobile.mdx": __fd_glob_29, "stack-and-tradeoffs/transport.mdx": __fd_glob_30, "ui-ux/design-philosophy.mdx": __fd_glob_31, "ui-ux/mobile-app-ux.mdx": __fd_glob_32, "ui-ux/web-portal-ux.mdx": __fd_glob_33, });