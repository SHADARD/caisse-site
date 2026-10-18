import {monthlyArchive} from '../../server/business-archives.mjs';
export function onRequest(context){return monthlyArchive(context.request,context.env);}
