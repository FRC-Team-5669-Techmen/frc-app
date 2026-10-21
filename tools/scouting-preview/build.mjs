/** Reproducible self-contained review file; never a production deployment. */
import {build} from 'esbuild'
import {mkdir,writeFile,readdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const featureFiles=(await readdir(resolve(root,'src/dev/fixture/features'))).filter(f=>f.endsWith('.js')).sort()
const result=await build({absWorkingDir:root,entryPoints:['tools/scouting-preview/entry.jsx'],bundle:true,write:false,outdir:'artifacts/scouting-review',format:'iife',minify:true,jsx:'automatic',target:['es2022'],define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl','.png':'dataurl'},plugins:[{
 name:'fixture-only',setup(b){
 b.onLoad({filter:/src\/dev\/fixture\/plugins\.js$/},()=>({contents:`import core from './core.js';\n${featureFiles.map((f,i)=>`import p${i} from './features/${f}';`).join('\n')}\nexport const FEATURES=[${featureFiles.map((f,i)=>`{name:${JSON.stringify(f.slice(0,-3))},...p${i}}`).join(',')}];export const PLUGINS=[core,...FEATURES];`,loader:'js'}));
 b.onResolve({filter:/^\.\/supabase(?:\.js)?$/},args=>args.importer===resolve(root,'src/ScoutingPage.jsx')?{path:resolve(root,'src/dev/fixture/client.js')}:null)},
}]})
const js=result.outputFiles.find(f=>f.path.endsWith('.js'))?.text
const css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text
if(!js||!css||!js.includes('techmen-fixture-client-v1'))throw new Error('Expected fixture code and inline styles were not built')
if(result.outputFiles.length!==2)throw new Error('Unexpected external review asset')
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Techmen Scouting · Fictional Review</title><style>${css.replaceAll('</style','<\\/style')}</style></head><body><div id="root"></div><noscript>Enable JavaScript to review the scouting application.</noscript><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`
const out=resolve(root,'artifacts/scouting-review/REVIEW.html')
await mkdir(dirname(out),{recursive:true});await writeFile(out,html)
console.log(`Review built: ${out} (${Buffer.byteLength(html)} bytes; network connections disabled by CSP)`)
