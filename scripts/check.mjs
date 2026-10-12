import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {validateManifest} from "./manifest.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
let count=0;
for(const dir of ["src","content"]){
  for(const file of await fs.readdir(path.join(root,dir))){
    if(!file.endsWith(".js"))continue;
    new vm.Script(await fs.readFile(path.join(root,dir,file),"utf8"),{filename:dir+"/"+file});count++;
  }
}
new vm.Script(await fs.readFile(path.join(root,"bootstrap.js"),"utf8"),{filename:"bootstrap.js"});count++;
for(const file of ["manifest.json","package.json"])JSON.parse(await fs.readFile(path.join(root,file),"utf8"));
const manifest=JSON.parse(await fs.readFile(path.join(root,"manifest.json"),"utf8"));
validateManifest(manifest);
console.log("Syntax checked "+count+" JavaScript files; manifests valid.");
