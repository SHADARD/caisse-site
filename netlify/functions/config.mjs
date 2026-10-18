import publicConfig from '../../server/public-config.mjs';
export default function(request){return publicConfig(request,process.env);}
