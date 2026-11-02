import type { User } from '@avalon/contracts';
import type { ScreenModel } from '../ui/widgets.js';
import { entryScreen } from './entry.js';

export function joinScreen(user: User | undefined, draft: string, submitting = false): ScreenModel {
  return {
    title: '加入朋友的房间',
    rows: [
      { id: 'input:join', text: draft || '点击输入房号或粘贴邀请链接' },
      { id: 'guide:join', text: '向朋友索取房间号或邀请链接，填写后点击下方按钮确认加入。' },
      { id: 'joinSubmit', text: submitting ? '正在加入…' : '确认加入房间' },
    ],
    web: {
      page: 'sheet', background: 'gate', backId: 'auxiliaryClose',
      document: { kind: 'join', modal: true, joinDraft: draft, joinSubmitting: submitting },
      underlay: entryScreen(user),
    },
  };
}
