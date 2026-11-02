import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinScreen } from '../src/screens/join.js';
import { layoutWebScreen } from '../src/ui/web-layout.js';
import { renderScreen } from '../src/ui/widgets.js';

for (const [width, height, top, bottom] of [[320,568,44,34],[390,844,88,34],[430,932,94,34]]) {
  test(`join field, inline error and confirm button remain visible at ${width}x${height}`, () => {
    const model = joinScreen(undefined, '654321');
    model.rows.unshift({ id: 'error', text: '房间已关闭，请重新创建或加入其他房间。' });
    const viewport = { width, height, top, bottom };
    const layout = layoutWebScreen(model, viewport);
    const field = layout.nodes.find(n => n.id === 'input:join')!;
    const error = layout.nodes.find(n => n.id === 'join-error')!;
    const submit = layout.nodes.find(n => n.id === 'joinSubmit')!;
    assert.equal(field.skin, 'input');
    assert.equal(field.text, '654321');
    assert.equal(submit.skin, 'gold-button');
    assert.equal(submit.primary, true);
    assert.equal(submit.disabled, false);
    assert.ok(field.y + field.height <= error.y, 'error must not obscure the field');
    assert.ok(error.y + error.height <= submit.y);
    for (const node of [field,error,submit]) {
      assert.ok(node.y >= (node.clipTop ?? top));
      assert.ok(node.y + node.height <= (node.clipBottom ?? height-bottom));
    }
    assert.ok(!layout.nodes.some(n => n.skin === 'toast'));
  });
}

test('empty and submitting join actions are not hit targets but editable filled form is', () => {
  const context = new Proxy({}, { get: (_, name) => name === 'measureText' ? (value: string) => ({width:value.length*8}) : name === 'createLinearGradient' || name === 'createRadialGradient' ? () => ({addColorStop(){}}) : () => {} });
  const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
  const viewport = {width:390,height:844,top:88,bottom:34};
  for (const [draft,submitting,enabled] of [['',false,false],['654321',false,true],['654321',true,false]] as const) {
    const targets = renderScreen(joinScreen(undefined,draft,submitting),canvas,viewport);
    assert.equal(targets.some(n=>n.id==='joinSubmit'),enabled);
    assert.equal(targets.some(n=>n.id==='input:join'),!submitting);
  }
});
