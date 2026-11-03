import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContentReviewCard, resolveContentReview, reviewImagePreview, type ContentReview, type ContentReviewApi } from '../src/AdminContentSafety.js';

const review: ContentReview = {
  id: 'a6a77cba-791c-42dc-b1ce-564e5f90863c', kind: 'chat',
  content: '<img src="https://evil.example/track" onerror="alert(1)">待核查原文',
  userId: 'player-id', createdAt: '2026-11-03T08:00:00Z',
};
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const card = (overrides: Partial<ContentReview> = {}, note = '', busy = false) => renderToStaticMarkup(createElement(ContentReviewCard, {
  review: { ...review, ...overrides }, note, busy, onNote() {}, onDecision() {},
}));

test('reviewed text is rendered as escaped text, without executing markup or loading its URL', () => {
  const html = card();
  assert.match(html, /&lt;img src=/);
  assert.match(html, /待核查原文/);
  assert.doesNotMatch(html, /<img |<script|<a /);
});

test('only bounded local PNG/JPEG/WebP data URLs can be used as image review previews', () => {
  assert.equal(reviewImagePreview(png), png);
  assert.match(card({ kind: 'image', content: png }), /<img[^>]+src="data:image\/png;base64,/);
  for (const content of ['https://evil.example/image.png', '//evil.example/image.png', 'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:text/html;base64,AAAA', png + 'A'.repeat(65_536)]) {
    assert.equal(reviewImagePreview(content), undefined);
    const html = card({ kind: 'image', content });
    assert.doesNotMatch(html, /<img /);
    assert.match(html, /未加载任何外部地址/);
  }
});

test('both review decisions require an explanation and stay disabled during an in-flight decision', () => {
  assert.equal((card({}, '  ').match(/disabled=""/g) || []).length, 2);
  assert.equal((card({}, '已逐项核查').match(/disabled=""/g) || []).length, 0);
  assert.equal((card({}, '已逐项核查', true).match(/disabled=""/g) || []).length, 3);
  assert.match(card(), /required=""/);
  assert.match(card(), /maxLength="200"/i);
});

test('review submissions use only the existing admin decision endpoint with a trimmed note', async () => {
  const calls: unknown[] = [];
  const request = (async (path: string, body?: unknown, method?: string) => { calls.push({ path, body, method }); return { ok: true }; }) as ContentReviewApi;
  await resolveContentReview(request, review.id, 'pass', '  已核查，无不当内容  ');
  await resolveContentReview(request, review.id, 'risky', '含不当内容');
  assert.deepEqual(calls, [
    { path: '/content-safety/reviews/' + review.id, body: { decision: 'pass', note: '已核查，无不当内容' }, method: 'POST' },
    { path: '/content-safety/reviews/' + review.id, body: { decision: 'risky', note: '含不当内容' }, method: 'POST' },
  ]);
});

test('blank or overlong notes make no request, and failed review submissions remain failures', async () => {
  let calls = 0;
  const request = (async () => { calls++; throw Error('REVIEW_NOT_FOUND'); }) as ContentReviewApi;
  for (const note of ['', '  ', '字'.repeat(201)]) await assert.rejects(resolveContentReview(request, review.id, 'pass', note), /处理说明/);
  assert.equal(calls, 0);
  await assert.rejects(resolveContentReview(request, review.id, 'pass', '核查完成'), /REVIEW_NOT_FOUND/);
  assert.equal(calls, 1);
});
