import createUser from '../../netlify/functions/create-user.mjs';
export async function onRequest(context) {
  return createUser(context.request, context.env);
}
