import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {validateManifest} from "../scripts/manifest.mjs";
const manifest=JSON.parse(await fs.readFile(new URL("../manifest.json",import.meta.url),"utf8"));
validateManifest(manifest);
for(const field of ["id","update_url","strict_min_version","strict_max_version"]){
 const broken=structuredClone(manifest);delete broken.applications.zotero[field];
 assert.throws(()=>validateManifest(broken),new RegExp(field));
 console.log("✓ missing Zotero manifest field is rejected: "+field);
}
const insecure=structuredClone(manifest);insecure.applications.zotero.update_url="data:application/json,{}";
assert.throws(()=>validateManifest(insecure),/HTTPS/);
console.log("✓ insecure update URL cannot pass the build gate");
console.log("\n5 installation-manifest regressions passed.");
