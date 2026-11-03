import { useEffect, useState } from 'react';

export type ContentReview = {
  id: string;
  kind: 'profile' | 'chat' | 'image';
  content: string;
  userId: string | null;
  createdAt: string;
};
export type ContentReviewApi = <T>(path: string, body?: unknown, method?: string) => Promise<T>;
type Decision = 'pass' | 'risky';
const kindNames = { profile: '昵称或资料文字', chat: '聊天文字', image: '自定义头像' };

export function reviewImagePreview(content: string): string | undefined {
  // Review data must never cause the administrator's browser to load an arbitrary URL.
  return content.length <= 65_536 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(content)
    ? content : undefined;
}

export async function resolveContentReview(request: ContentReviewApi, id: string, decision: Decision, note: string) {
  const explanation = note.trim();
  if (!explanation || explanation.length > 200) throw new Error('请填写1–200字的处理说明。');
  return request('/content-safety/reviews/' + encodeURIComponent(id), { decision, note: explanation }, 'POST');
}

export function ContentReviewCard({ review, note, busy, onNote, onDecision }: {
  review: ContentReview;
  note: string;
  busy: boolean;
  onNote: (value: string) => void;
  onDecision: (decision: Decision) => void;
}) {
  const preview = review.kind === 'image' ? reviewImagePreview(review.content) : undefined;
  const date = new Date(review.createdAt);
  const canSubmit = !busy && note.trim().length > 0 && note.trim().length <= 200;
  return <article className="admin-review-card" aria-label={kindNames[review.kind] + '待复核'}>
    <div className="admin-review-meta">
      <strong>{kindNames[review.kind]}</strong>
      <time dateTime={review.createdAt}>{Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN')}</time>
    </div>
    <p className="admin-review-user">玩家：{review.userId || '未关联账号'}</p>
    {review.kind === 'image'
      ? preview ? <img className="admin-review-image" src={preview} alt="待复核的自定义头像" loading="lazy" decoding="async" />
        : <p className="admin-review-error" role="alert">此图片无法安全预览，未加载任何外部地址。请核查后再处理。</p>
      : <pre className="admin-review-content">{review.content}</pre>}
    <label htmlFor={'review-note-' + review.id}>处理说明（必填，最多200字）</label>
    <textarea id={'review-note-' + review.id} className="admin-input" value={note} onChange={event => onNote(event.target.value)}
      disabled={busy} required maxLength={200} rows={3} placeholder="填写通过或拒绝的依据" />
    <div className="admin-review-actions">
      <button type="button" className="admin-action-btn" disabled={!canSubmit} onClick={() => onDecision('pass')}>通过复核</button>
      <button type="button" className="admin-action-btn danger" disabled={!canSubmit} onClick={() => onDecision('risky')}>拒绝内容</button>
    </div>
  </article>;
}

function describeReviewError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'REVIEW_NOT_FOUND') return '这条内容已被处理，请刷新待办列表。';
  return /[\u3400-\u9fff]/.test(message) ? message : '内容审核操作未完成，请稍后重试。';
}

export function AdminContentSafety({ request, refreshToken = 0 }: { request: ContentReviewApi; refreshToken?: number }) {
  const [reviews, setReviews] = useState<ContentReview[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void request<{ reviews: ContentReview[] }>('/content-safety/reviews').then(result => {
      if (active) setReviews(result.reviews);
    }).catch(cause => { if (active) setError(describeReviewError(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, refreshToken, reload]);

  async function decide(review: ContentReview, decision: Decision) {
    if (pendingId || loading) return;
    setPendingId(review.id); setError(''); setNotice('');
    try {
      await resolveContentReview(request, review.id, decision, notes[review.id] || '');
      setReviews(items => items.filter(item => item.id !== review.id));
      setNotes(previous => { const next = { ...previous }; delete next[review.id]; return next; });
      setNotice(decision === 'pass' ? '已通过复核。处理后由玩家重试提交，历史聊天不会自动发送。' : '已拒绝该内容。请让玩家修改文字或更换头像后重试。');
    } catch (cause) { setError(describeReviewError(cause)); }
    finally { setPendingId(undefined); }
  }

  return <section className="admin-panel admin-content-safety" aria-labelledby="content-review-title">
    <div className="admin-review-heading">
      <h2 id="content-review-title" className="admin-panel-title">内容审核</h2>
      <button type="button" className="admin-action-btn" disabled={loading || !!pendingId} onClick={() => { setNotice(''); setReload(value => value + 1); }}>刷新待办</button>
    </div>
    <p className="admin-review-hint">这里展示需要人工复核的内容原文。处理后由玩家重试提交；通过复核不会自动发送历史聊天。</p>
    <p className="admin-review-hint">每次最多显示100条待办，处理后可刷新查看其余内容。</p>
    {error && <p className="admin-review-error" role="alert">{error}</p>}
    {notice && <p className="admin-review-notice" role="status">{notice}</p>}
    {loading && <p role="status">正在读取审核待办…</p>}
    {!loading && !error && reviews.length === 0 && <p role="status">当前没有待复核内容。</p>}
    <div className="admin-review-list">
      {reviews.map(review => <ContentReviewCard key={review.id} review={review} note={notes[review.id] || ''}
        busy={loading || !!pendingId} onNote={value => setNotes(previous => ({ ...previous, [review.id]: value }))}
        onDecision={decision => { void decide(review, decision); }} />)}
    </div>
  </section>;
}
