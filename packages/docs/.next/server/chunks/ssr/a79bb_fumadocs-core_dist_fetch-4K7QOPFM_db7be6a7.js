module.exports=[31707,a=>{"use strict";async function b(a,b,c,d){let e=new URLSearchParams;e.set("query",a),b&&e.set("locale",b),c&&e.set("tag",c);let f=await fetch(`${d.api??"/api/search"}?${e.toString()}`);if(!f.ok)throw Error(await f.text());return await f.json()}a.i(94468),a.s(["fetchDocs",()=>b])}];

//# sourceMappingURL=a79bb_fumadocs-core_dist_fetch-4K7QOPFM_db7be6a7.js.map