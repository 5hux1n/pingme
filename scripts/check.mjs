import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const themeFolders=readdirSync('public/themes',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>'public/themes/'+d.name);
for(const folder of ['public','src',...themeFolders])for(const file of readdirSync(folder).filter(f=>f.endsWith('.js'))){const result=spawnSync(process.execPath,['--check',folder+'/'+file],{stdio:'inherit'});if(result.status)process.exit(result.status);}
console.log('JavaScript syntax checked.');
