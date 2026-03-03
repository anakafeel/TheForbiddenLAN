module.exports = [
"[project]/node_modules/.pnpm/fumadocs-core@14.7.7_@types+react@19.2.14_next@16.1.6_@babel+core@7.29.0_babel-plugin-r_bf3a097180b8007f7ecdc618f44bfe67/node_modules/fumadocs-core/dist/fetch-4K7QOPFM.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "fetchDocs",
    ()=>fetchDocs
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$fumadocs$2d$core$40$14$2e$7$2e$7_$40$types$2b$react$40$19$2e$2$2e$14_next$40$16$2e$1$2e$6_$40$babel$2b$core$40$7$2e$29$2e$0_babel$2d$plugin$2d$r_bf3a097180b8007f7ecdc618f44bfe67$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$chunk$2d$MLKGABMK$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/fumadocs-core@14.7.7_@types+react@19.2.14_next@16.1.6_@babel+core@7.29.0_babel-plugin-r_bf3a097180b8007f7ecdc618f44bfe67/node_modules/fumadocs-core/dist/chunk-MLKGABMK.js [app-ssr] (ecmascript)");
;
// src/search/client/fetch.ts
async function fetchDocs(query, locale, tag, options) {
    const params = new URLSearchParams();
    params.set("query", query);
    if (locale) params.set("locale", locale);
    if (tag) params.set("tag", tag);
    const res = await fetch(`${options.api ?? "/api/search"}?${params.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}
;
}),
];

//# sourceMappingURL=a79bb_fumadocs-core_dist_fetch-4K7QOPFM_db7be6a7.js.map