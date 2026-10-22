// Development only: keep the public rule text identical to the web source.
import { build } from 'esbuild';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const root=resolve(import.meta.dirname,'../../..'),out=resolve(root,'dist/minigame-guide-source.cjs');
await mkdir(resolve(root,'dist'),{recursive:true});
await build({stdin:{contents:"import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{GuideRules}from'./apps/web/src/GuidePanel.tsx';export const html=renderToStaticMarkup(React.createElement(GuideRules));",resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:out});
const {html}=createRequire(import.meta.url)(out);
const clean=s=>s.replace(/<svg[\s\S]*?<\/svg>/g,'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const blocks=[...html.matchAll(/<(h2|h3|p|dd|dt|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map(m=>({heading:m[1]==='h2'||m[1]==='h3',text:clean(m[2])})).filter(b=>b.text.trim());
await writeFile(resolve(root,'apps/minigame/src/ui/web-guide-rules.ts'),'// Generated from GuideRules; run node apps/minigame/scripts/generate-web-guide.mjs.\nexport const webGuideRules = '+JSON.stringify(blocks,null,2)+' as const;\n');
console.log('Public web rule blocks:',blocks.length);
