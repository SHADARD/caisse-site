import {mkdir,copyFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const directory=new URL('./dist/',import.meta.url);
await rm(directory,{recursive:true,force:true});
await mkdir(directory,{recursive:true});
for(const name of ['index.html','style.css','app.js','domain.mjs','config.js','_headers','_routes.json']) {
 await copyFile(new URL(name,import.meta.url),new URL(name,directory));
}
try {await copyFile(new URL('image1.jpg',import.meta.url),new URL('image1.jpg',directory));}
catch(error){if(error.code!=='ENOENT')throw error;}
console.log('Fichiers publics préparés dans '+fileURLToPath(directory));
