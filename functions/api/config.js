import publicConfig from '../../server/public-config.mjs';
export function onRequest(context){return publicConfig(context.request,context.env);}
