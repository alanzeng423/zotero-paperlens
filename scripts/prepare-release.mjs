import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const manifest=JSON.parse(await fs.readFile(path.join(root,"manifest.json"),"utf8"));
const pkg=JSON.parse(await fs.readFile(path.join(root,"package.json"),"utf8"));
if(pkg.version!==manifest.version)throw new Error("Package and add-on versions must match");
const repository=pkg.repository.url.replace(/\.git$/,"");
if(!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw new Error("Expected a GitHub HTTPS repository URL");
const addon=manifest.applications.zotero;
const asset=`zotero-paperlens-${manifest.version}.xpi`;
const bytes=await fs.readFile(path.join(root,"dist",asset));
const hash=createHash("sha256").update(bytes).digest("hex");
const updates={addons:{[addon.id]:{updates:[{
  version:manifest.version,
  update_link:`${repository}/releases/download/v${manifest.version}/${asset}`,
  update_hash:`sha256:${hash}`,
  applications:{zotero:{strict_min_version:addon.strict_min_version,strict_max_version:addon.strict_max_version}}
}]}}};
await fs.writeFile(path.join(root,"updates.json"),JSON.stringify(updates,null,2)+"\n");
await fs.writeFile(path.join(root,"dist","SHA256SUMS"),`${hash}  ${asset}\n`);
console.log(`Prepared update manifest and SHA256SUMS for v${manifest.version}`);
