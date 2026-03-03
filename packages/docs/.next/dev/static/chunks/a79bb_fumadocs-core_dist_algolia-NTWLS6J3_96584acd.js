(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/node_modules/.pnpm/fumadocs-core@14.7.7_@types+react@19.2.14_next@16.1.6_@babel+core@7.29.0_babel-plugin-r_bf3a097180b8007f7ecdc618f44bfe67/node_modules/fumadocs-core/dist/algolia-NTWLS6J3.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "groupResults",
    ()=>groupResults,
    "searchDocs",
    ()=>searchDocs
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$fumadocs$2d$core$40$14$2e$7$2e$7_$40$types$2b$react$40$19$2e$2$2e$14_next$40$16$2e$1$2e$6_$40$babel$2b$core$40$7$2e$29$2e$0_babel$2d$plugin$2d$r_bf3a097180b8007f7ecdc618f44bfe67$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$chunk$2d$MLKGABMK$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/fumadocs-core@14.7.7_@types+react@19.2.14_next@16.1.6_@babel+core@7.29.0_babel-plugin-r_bf3a097180b8007f7ecdc618f44bfe67/node_modules/fumadocs-core/dist/chunk-MLKGABMK.js [app-client] (ecmascript)");
;
// src/search/client/algolia.ts
function groupResults(hits) {
    const grouped = [];
    const scannedUrls = /* @__PURE__ */ new Set();
    for (const hit of hits){
        if (!scannedUrls.has(hit.url)) {
            scannedUrls.add(hit.url);
            grouped.push({
                id: hit.url,
                type: "page",
                url: hit.url,
                content: hit.title
            });
        }
        grouped.push({
            id: hit.objectID,
            type: hit.content === hit.section ? "heading" : "text",
            url: hit.section_id ? `${hit.url}#${hit.section_id}` : hit.url,
            content: hit.content
        });
    }
    return grouped;
}
async function searchDocs(index, query, tag, options) {
    let filters = options?.filters;
    if (tag) filters = filters ? `tag:${tag} AND (${filters})` : `tag:${tag}`;
    if (query.length === 0) {
        const result2 = await index.search(query, {
            distinct: 1,
            hitsPerPage: 8,
            ...options,
            filters
        });
        return groupResults(result2.hits).filter((hit)=>hit.type === "page");
    }
    const result = await index.search(query, {
        distinct: 5,
        hitsPerPage: 10,
        ...options,
        filters
    });
    return groupResults(result.hits);
}
;
}),
]);

//# sourceMappingURL=a79bb_fumadocs-core_dist_algolia-NTWLS6J3_96584acd.js.map