import {monthlyArchive} from '../../server/business-archives.mjs';
export default function(request){return monthlyArchive(request,process.env);}
