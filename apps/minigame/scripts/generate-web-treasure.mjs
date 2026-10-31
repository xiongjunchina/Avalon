// Public wording is generated from the actual web component, never a separate paraphrase.
import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const root=resolve(import.meta.dirname,'../../..'),out=resolve(root,'dist/treasure-copy.cjs');
await build({stdin:{contents:`import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{TreasureModal}from'./apps/web/src/TreasureModal.tsx';import{parityFixture}from'./apps/minigame/scripts/parity-fixture.ts';export const html=Object.fromEntries(['merlin','percival','guinevere','loyal','morgana','assassin','mordred','oberon','minion'].map(role=>{const {room,user}=parityFixture('treasures-'+role,12);return [role,renderToStaticMarkup(React.createElement(TreasureModal,{open:true,onClose:()=>{},self:room.game.self,players:room.game.players,game:room.game,treasuresEnabled:true,userId:user.id}))]}));`,resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:out});
const {html}=createRequire(import.meta.url)(out),clean=s=>(s??'').replace(/<br\s*\/?\s*>/g,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').trim();
const copy=Object.fromEntries(Object.entries(html).map(([role,s])=>[role,{title:clean(s.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]),badge:clean(s.match(/class="treasure-badge"[^>]*>([\s\S]*?)<\/span>/)?.[1]),description:clean(s.match(/class="treasure-desc"[^>]*>([\s\S]*?)<\/p>/)?.[1]),idle:clean(s.match(/class="treasure-status-idle"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1])}]));
await writeFile(resolve(root,'apps/minigame/src/ui/web-treasure-copy.ts'),'// Generated from TreasureModal. Run node apps/minigame/scripts/generate-web-treasure.mjs.\nexport const webTreasureCopy = '+JSON.stringify(copy,null,2)+' as const;\n');
console.log('Copied public web treasure descriptions:',Object.keys(copy).length);
