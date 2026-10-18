import {mkdir,copyFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const directory=new URL('./dist/',import.meta.url);
await rm(directory,{recursive:true,force:true});
await mkdir(directory,{recursive:true});
for(const name of ['index.html','style.css','app.js','domain.mjs','config.js','_headers','_routes.json']) {
 await copyFile(new URL(name,import.meta.url),new URL(name,directory));
}
await copyFile(new URL('image1.png',import.meta.url),new URL('image1.png',directory));
console.log('Fichiers publics préparés dans '+fileURLToPath(directory));

await mkdir(new URL('downloads/',directory),{recursive:true});
for(const name of ['flamingo-network-v1.0.0.apk','flamingo-network-v1.0.0.apk.sha256','flamingo-network-v1.0.1.apk','flamingo-network-v1.0.1.apk.sha256']){
 await copyFile(new URL('downloads/'+name,import.meta.url),new URL('downloads/'+name,directory));
}
