import removeManaged from '../../netlify/functions/delete-managed.mjs';
export async function onRequest(context){return removeManaged(context.request,context.env);}
