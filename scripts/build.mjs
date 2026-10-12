import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {deflateRawSync} from "node:zlib";
import vm from "node:vm";
import {validateManifest} from "./manifest.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const manifest=JSON.parse(await fs.readFile(path.join(root,"manifest.json"),"utf8"));
validateManifest(manifest);
const entries=[];
async function collect(folder){
  for(const entry of (await fs.readdir(path.join(root,folder),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const relative=folder+"/"+entry.name;
    if(entry.isDirectory()){await collect(relative);continue;}
    const data=await fs.readFile(path.join(root,relative));
    if(entry.name.endsWith(".js"))new vm.Script(data.toString("utf8"),{filename:relative});
    entries.push({name:relative,data});
  }
}
for(const folder of ["src","content","locale"])await collect(folder);
const bootstrap=await fs.readFile(path.join(root,"bootstrap.js"));
new vm.Script(bootstrap.toString("utf8"),{filename:"bootstrap.js"});
entries.unshift({name:"manifest.json",data:Buffer.from(JSON.stringify(manifest,null,2)+"\n")},{name:"bootstrap.js",data:bootstrap},
  {name:"LICENSE",data:await fs.readFile(path.join(root,"LICENSE"))});
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let n=0xffffffff;for(const c of data)n=table[(n^c)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
const local=[],central=[];let offset=0;
for(const entry of entries){
  const name=Buffer.from(entry.name,"utf8"),compressed=deflateRawSync(entry.data),crc=crc32(entry.data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);
  header.writeUInt16LE(8,8);header.writeUInt16LE(0x21,12);header.writeUInt32LE(crc,14);
  header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(entry.data.length,22);header.writeUInt16LE(name.length,26);
  const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50,0);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);
  record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);record.writeUInt16LE(0x21,14);record.writeUInt32LE(crc,16);
  record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(entry.data.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);
  local.push(header,name,compressed);central.push(record,name);offset+=header.length+name.length+compressed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
await fs.mkdir(path.join(root,"dist"),{recursive:true});
const out=path.join(root,"dist","zotero-paperlens-"+manifest.version+".xpi");
await fs.writeFile(out,Buffer.concat([...local,directory,end]));
console.log("Built "+out+" ("+entries.length+" files)");
