// Adresse technique stable : les identifiants restent libres, sans dépendre du format e-mail.
export async function accountEmail(username){
 const bytes=new TextEncoder().encode(username.trim().toLowerCase());
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')+'@users.caisse.invalid';
}
export async function loginEmails(username){
 const value=username.trim().toLowerCase();
 return [await accountEmail(value),value.includes('@')?value:value+'@users.caisse.invalid'];
}
