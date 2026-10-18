import { WuYueBackdrop } from './Heraldry';
import { WUYUE_MISSIONS } from './roles';

/** Shared by the waiting room and live game, with no private game information. */
export function QuestMedallion({
  mission, count, current = false, passed, twoFailsRequired, attempts = 0, onInspect,
}: {
  mission: number;
  count: number;
  current?: boolean;
  passed?: boolean;
  twoFailsRequired: boolean;
  attempts?: number;
  onInspect?: () => void;
}) {
  const mountain = WUYUE_MISSIONS[mission - 1];
  const status = passed === undefined ? (current ? '当前取经' : '尚未完成') : passed ? '成功' : '失败';
  const label = `任务 ${mission}（${mountain?.title ?? '取经'}），${count} 人，${status}，需要${twoFailsRequired ? 2 : 1}张失败牌${attempts ? `，已组队${attempts}次` : ''}`;
  const content = <>
    <span className="quest-mountain-name">{mountain?.title ?? `${mission}·取经`}</span>
    <span className="quest-circle" aria-hidden="true">
      <WuYueBackdrop mission={mission} />
      {passed !== undefined && <span className="quest-result-mark">{passed ? '✓' : '×'}</span>}
    </span>
    <span className="quest-party-size">{count}<small>人</small></span>
    <span className={`quest-caption ${twoFailsRequired ? 'requires-two' : ''}`}>
      {passed !== undefined ? status : twoFailsRequired ? '需2败' : current ? '进行中' : `第${mission}难`}
    </span>
  </>;
  const className = `quest-medallion-wrap ${passed === undefined ? current ? 'mission-current' : 'mission-pending' : passed ? 'mission-success' : 'mission-failure'}`;
  return onInspect ? (
    <button type="button" className={className} onClick={onInspect} aria-label={`查看${label}组队与投票详情`} aria-current={current ? 'step' : undefined}>
      {content}
    </button>
  ) : <div className={className} aria-label={label}>{content}</div>;
}
