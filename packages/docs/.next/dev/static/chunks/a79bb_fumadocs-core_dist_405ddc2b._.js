(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/node_modules/.pnpm/fumadocs-core@14.7.7_@types+react@19.2.14_next@16.1.6_@babel+core@7.29.0_babel-plugin-r_bf3a097180b8007f7ecdc618f44bfe67/node_modules/fumadocs-core/dist/chunk-DELA6Z2I.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "removeUndefined",
    ()=>removeUndefined
]);
// src/utils/remove-undefined.ts
function removeUndefined(value) {
    const obj = value;
    for (const key of Object.keys(obj)){
        if (obj[key] === void 0) delete obj[key];
    }
    return value;
}
;
}),
"[project]/node_modules/.pnpm/fumadocs-core@14.7.7_@types+react@19.2.14_next@16.1.6_@babel+core@7.29.0_babel-plugin-r_bf3a097180b8007f7ecdc618f44bfe67/node_modules/fumadocs-core/dist/orama-cloud-HAZVD2ZO.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "searchDocs",
    ()=>searchDocs
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$fumadocs$2d$core$40$14$2e$7$2e$7_$40$types$2b$react$40$19$2e$2$2e$14_next$40$16$2e$1$2e$6_$40$babel$2b$core$40$7$2e$29$2e$0_babel$2d$plugin$2d$r_bf3a097180b8007f7ecdc618f44bfe67$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$chunk$2d$DELA6Z2I$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/fumadocs-core@14.7.7_@types+react@19.2.14_next@16.1.6_@babel+core@7.29.0_babel-plugin-r_bf3a097180b8007f7ecdc618f44bfe67/node_modules/fumadocs-core/dist/chunk-DELA6Z2I.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$fumadocs$2d$core$40$14$2e$7$2e$7_$40$types$2b$react$40$19$2e$2$2e$14_next$40$16$2e$1$2e$6_$40$babel$2b$core$40$7$2e$29$2e$0_babel$2d$plugin$2d$r_bf3a097180b8007f7ecdc618f44bfe67$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$chunk$2d$MLKGABMK$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/fumadocs-core@14.7.7_@types+react@19.2.14_next@16.1.6_@babel+core@7.29.0_babel-plugin-r_bf3a097180b8007f7ecdc618f44bfe67/node_modules/fumadocs-core/dist/chunk-MLKGABMK.js [app-client] (ecmascript)");
;
;
// src/search/client/orama-cloud.ts
async function searchDocs(query, tag, options) {
    const { client, params: extraParams = {} } = options;
    const params = {
        ...extraParams,
        term: query,
        where: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$fumadocs$2d$core$40$14$2e$7$2e$7_$40$types$2b$react$40$19$2e$2$2e$14_next$40$16$2e$1$2e$6_$40$babel$2b$core$40$7$2e$29$2e$0_babel$2d$plugin$2d$r_bf3a097180b8007f7ecdc618f44bfe67$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$chunk$2d$DELA6Z2I$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["removeUndefined"])({
            tag,
            ...extraParams.where
        }),
        groupBy: {
            properties: [
                "page_id"
            ],
            maxResult: 7,
            ...extraParams.groupBy
        }
    };
    const result = await client.search(params);
    if (!result) return [];
    const list = [];
    for (const item of result.groups ?? []){
        let addedHead = false;
        for (const hit of item.result){
            const doc = hit.document;
            if (!addedHead) {
                list.push({
                    id: doc.page_id,
                    type: "page",
                    content: doc.title,
                    url: doc.url
                });
                addedHead = true;
            }
            list.push({
                id: doc.id,
                content: doc.content,
                type: doc.content === doc.section ? "heading" : "text",
                url: doc.section_id ? `${doc.url}#${doc.section_id}` : doc.url
            });
        }
    }
    return list;
}
;
}),
]);

//# sourceMappingURL=a79bb_fumadocs-core_dist_405ddc2b._.js.map