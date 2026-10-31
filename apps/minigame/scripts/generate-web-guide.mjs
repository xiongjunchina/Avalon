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

// Preserve public document structure, not only flattened text, for Canvas layout.
const tree={tag:'root',attrs:'',children:[]},stack=[tree];
for(const token of html.match(/<[^>]+>|[^<]+/g)??[]){
 if(token.startsWith('</')){if(stack.length>1)stack.pop();}
 else if(token.startsWith('<')){const tag=/^<([\w-]+)/.exec(token)?.[1];if(!tag)continue;const node={tag,attrs:token,children:[]};stack.at(-1).children.push(node);if(!/\/>$/.test(token)&&!['img','br','input','meta','link'].includes(tag))stack.push(node);}
 else stack.at(-1).children.push(token);
}
const cls=n=>typeof n==='object'?(/class="([^"]*)"/.exec(n.attrs)?.[1]??''):'';
const content=n=>typeof n==='string'?clean(n):n.tag==='svg'?'':n.children.map(content).join('');
const find=(n,p)=>typeof n==='string'?[]:[...(p(n)?[n]:[]),...n.children.flatMap(c=>find(c,p))];
const block=n=>({tag:n.tag,style:cls(n),text:content(n).trim()});
const sections=find(tree,n=>n.tag==='section').map(section=>({
 eyebrow:content(section.children.find(n=>n.tag==='p')??''),title:content(section.children.find(n=>n.tag==='h2')??''),
 blocks:section.children.filter(n=>typeof n!=='string'&&n.tag!=='h2'&&cls(n)!=='eyebrow').map(n=>{
  if(cls(n)==='guide-victories')return {kind:'victories',items:n.children.filter(c=>typeof c!=='string').map(c=>({title:content(c.children.find(v=>v.tag==='h3')??''),text:content(c.children.find(v=>v.tag==='p')??''),team:cls(c).includes('blue')?'blue':'red'}))};
  if(cls(n)==='guide-steps')return {kind:'steps',items:n.children.filter(c=>c.tag==='li').map(c=>({title:content(find(c,v=>v.tag==='strong')[0]??''),subtitle:content(find(c,v=>v.tag==='small')[0]??''),paragraphs:find(c,v=>v.tag==='p').map(block)}))};
  if(cls(n)==='guide-configs')return {kind:'configs',items:n.children.filter(c=>c.tag==='article').map(c=>({title:content(find(c,v=>v.tag==='h3')[0]??''),paragraphs:find(c,v=>v.tag==='p').map(block),missions:find(c,v=>v.tag==='li').map(m=>({...block(m),label:content(find(m,v=>v.tag==='span')[0]??''),count:content(find(m,v=>v.tag==='strong')[0]??'')}))}))};
  if(n.tag==='dl')return {kind:'options',items:n.children.filter(c=>typeof c!=='string').map(block)};
  if(n.tag==='ul')return {kind:'list',items:n.children.filter(c=>c.tag==='li').map(block)};
  return {kind:'paragraph',text:content(n).trim(),style:cls(n)};
 })
}));
await writeFile(resolve(root,'apps/minigame/src/ui/web-guide-sections.ts'),'// Generated from GuideRules. Do not edit.\nexport const webGuideSections = '+JSON.stringify(sections,null,2)+' as const;\n');
