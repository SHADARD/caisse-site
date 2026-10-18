import {resetAll} from '../../server/business-archives.mjs';
export function onRequest(context){return resetAll(context.request,context.env);}
