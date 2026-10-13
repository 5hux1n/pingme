import { build } from 'esbuild';
await build({entryPoints:['frontend/projects.jsx'],bundle:true,format:'esm',minify:true,target:'es2022',outfile:'public/admin-projects.js',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
console.log('Built project administration.');
