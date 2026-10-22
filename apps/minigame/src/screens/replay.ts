import type { Replay } from '@avalon/contracts';
import type { ScreenModel } from '../ui/widgets.js';

export function replayScreen(replay: Replay, backId: string, showFavorite = false): ScreenModel {
  const name = (id: string) => {
    const player = replay.players.find(item => item.id === id);
    return player ? `${player.seat}号${player.nickname}` : '未知成员';
  };
  return { title: '对局复盘', subtitle: `${replay.playerCount}人 · ${replay.result.winner === 'blue' ? '蓝方获胜' : replay.result.winner === 'red' ? '红方获胜' : '中止'}`, rows: [
    { id: 'replay:reason', text: `结案：${replay.result.reason}${replay.result.targetId ? ` · 目标${name(replay.result.targetId)}` : ''}` },
    { id: 'replay:rules', text: `规则 ${replay.rulesetVersion} · ${replay.settings.anonymousTeamVote ? '匿名组队投票' : '公开组队投票'}` },
    ...replay.players.map(player => ({ id: `replay:player:${player.id}`, text: `${name(player.id)} · ${replay.roles[player.id] ?? '未知身份'}` })),
    ...replay.rounds.flatMap(round => [
      { id: `replay:round:${round.number}`, text: `第${round.number}轮 / 任务${round.mission} · 队长${name(round.captainId)}` },
      { id: `replay:team:${round.number}`, text: `出征：${round.team.map(name).join('、') || '未确定'}` },
      ...(round.vote ? [{ id: `replay:vote:${round.number}`, text: `组队投票：赞成${round.vote.approvals} · 反对${round.vote.rejections} · 弃权${round.vote.abstentions ?? 0} · ${round.vote.passed ? '通过' : '否决'}` }] : []),
      ...(round.result ? [{ id: `replay:mission:${round.number}`, text: `任务：成功${round.result.successes} · 失败${round.result.failures} · ${round.result.passed ? '成功' : '失败'}` }] : []),
      ...replay.inspections.filter(item => item.afterMission === round.mission && round.result).map((item, index) => ({ id: `replay:inspection:${round.number}:${index}`, text: `宝镜：${name(item.inspectorId)} 查验 ${name(item.targetId)}` })),
      ...replay.earlyWindows.filter(item => item.afterProposal === round.number).map((item, index) => ({ id: `replay:early:${round.number}:${index}`, text: `提前刺杀窗口：${item.decision === 'attempt' ? '发起' : '跳过'}` })),
    ]),
    ...(showFavorite ? [{ id: 'favorite', text: replay.favorite ? '取消收藏' : '收藏本局' }] : []),
    { id: backId, text: '返回对局记录' },
  ] };
}
