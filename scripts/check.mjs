import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const folder of ['public','src'])for(const file of readdirSync(folder).filter(f=>f.endsWith('.js'))){const result=spawnSync(process.execPath,['--check',folder+'/'+file],{stdio:'inherit'});if(result.status)process.exit(result.status);}
console.log('JavaScript syntax checked.');
