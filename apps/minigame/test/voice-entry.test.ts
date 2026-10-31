import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeVoice} from '../src/platform/native-voice.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';

test('voice join is visible before music settings without scrolling on short phones',()=>{
 const voice=new NativeVoice({},async()=>({} as any),()=>{});voice.syncRoom('test-room',5);
 for(const width of [320,390,430]){
  const layout=layoutWebScreen({title:'声音设置',rows:voice.rows(),web:{page:'sheet',document:{kind:'sound',modal:true,soundPreferences:{music:true,effects:true}}}}, {width,height:568,top:88,bottom:34});
  const join=layout.nodes.find(n=>n.id==='voice:join')!;
  assert.ok(join,'voice join exists');
  assert.ok(join.y>=layout.contentTop && join.y+join.height<=layout.contentBottom,'join must be fully visible without scrolling');
 }
});
