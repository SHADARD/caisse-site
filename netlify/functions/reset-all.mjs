import {resetAll} from '../../server/business-archives.mjs';
export default function(request){return resetAll(request,process.env);}
