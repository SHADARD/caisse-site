export const MAX_FILE_SIZE=10*1024*1024;
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',csv:'text/csv'};
export function describeFile(file){
 if(!file||!Number.isFinite(file.size)||file.size<=0)throw Error('Ce fichier est vide ou illisible.');
 if(file.size>MAX_FILE_SIZE)throw Error('Le fichier dépasse la limite de 10 Mo.');
 const ext=file.name.split('.').pop().toLowerCase(),type=types[ext];
 if(!type||file.type&&!Object.values(types).includes(file.type)&&file.type!=='application/octet-stream')throw Error('Choisissez une photo, un PDF, un document Office, TXT ou CSV.');
 return{name:file.name.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,255),type,size:file.size,ext};
}
export function fileSize(bytes){return bytes>=1048576?(bytes/1048576).toLocaleString('fr',{maximumFractionDigits:1})+' Mo':Math.max(1,Math.ceil(bytes/1024))+' Ko';}
export function previewable(type){return ['image/jpeg','image/png','image/webp','image/gif'].includes(type);}
