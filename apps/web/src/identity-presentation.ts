import type { GameView } from '@avalon/contracts';
import { ROLE_CONFIG } from '@avalon/game-core';
import { GUARDIAN_TREASURE_DISABLED_REASON } from './treasure-access';

export function identityKnowledge(self: NonNullable<GameView['self']>, count: number) {
  const candidates = self.merlinCandidates.length ? self.merlinCandidates
    : self.guinevereCandidates?.length ? self.guinevereCandidates
    : self.guardianClue?.targetIds?.length ? self.guardianClue.targetIds
    : self.evilIds;
  const title = self.merlinCandidates.length ? '两位大圣 · 真假待辨'
    : self.guinevereCandidates?.length ? '两道天机 · 尚待查证'
    : self.guardianClue ? self.guardianClue.title
    : self.role === 'merlin' ? '你火眼金睛识破的群妖' : self.evilIds.length ? '与你相认的同伙群妖' : '取经漫漫 · 静观其变';
  const description = self.merlinCandidates.length ? '一位是真大圣孙悟空，一位是假大圣六耳猕猴，无法分辨对应身份。'
    : self.guinevereCandidates?.length ? '一位是假扮佛祖的黄眉老怪，一位是取经正果同伴，无法分辨对应身份。'
    : self.guardianClue ? self.guardianClue.description
    : self.role === 'merlin' ? (ROLE_CONFIG[count]?.includes('mordred') ? '本局含黄眉老怪（假扮如来设小雷音寺），他不在你的火眼金睛视野中；所见成员仅知阵营，不知角色。' : '以上是本局全部群妖成员，仅知阵营，不知具体角色。')
    : self.evilIds.length ? (ROLE_CONFIG[count]?.includes('oberon') ? '本局牛魔王独霸一方不参与相认；同伙仅知阵营，不知角色。' : '以上是与你相认的群妖同伙，仅知阵营，不知具体角色。')
    : '没有其他初始身份线索，请从发言与取经战况中判断。';

  return { candidates, title, description };
}

export function identityTreasure(self: NonNullable<GameView['self']>, count: number, treasuresEnabled: boolean, game?: GameView) {
  if (self.treasures?.disabledReason === 'guardian_perks') return { enabled: false, description: GUARDIAN_TREASURE_DISABLED_REASON };
  const is8Plus = count >= 8;
  const isTreasureModeActive = Boolean(treasuresEnabled && is8Plus && self.treasures?.enabled);
  const canClickTreasure = isTreasureModeActive || self.role === 'assassin';

  let treasureSub = '';
  if (!isTreasureModeActive) {
    if (self.role === 'assassin') {
      if (game?.phase === 'assassination') {
        treasureSub = '🔥 终局刺杀 · 点击祭出火尖枪！';
      } else if (self.canDecideEarly) {
        treasureSub = '🗡️ 提前刺杀窗口已解锁';
      } else {
        treasureSub = '火尖枪（刺客专属神兵）';
      }
    } else {
      treasureSub = '未开启法宝模式（仅刺客可用神兵）';
    }
  } else {
    if (self.role === 'percival') {
      treasureSub = self.treasures?.tinStaff?.used
        ? '九环锡杖（已显灵）'
        : self.treasures?.tinStaff?.available
          ? '✨ 可私密查验盲区仙友！'
          : '九环锡杖（第2轮任务后解锁）';
    } else if (self.role === 'guinevere') {
      treasureSub = self.treasures?.guanyinMirror?.used
        ? '慈航照妖镜（已照耀）'
        : self.treasures?.guanyinMirror?.available
          ? '✨ 可照耀车队队员！'
          : '慈航照妖镜（发车后可用）';
    } else if (self.role === 'mordred') {
      treasureSub = self.treasures?.humanBag?.used
        ? '后天人种袋（已收人）'
        : self.treasures?.humanBag?.available
          ? '✨ 可禁选1人上车！'
          : '后天人种袋（第3/4轮提名前解锁）';
    } else if (self.role === 'loyal') {
      treasureSub = self.treasures?.jinguSeal?.used
        ? '紧箍信物（已通灵）'
        : self.treasures?.jinguSeal?.available
          ? '✨ 绝境信物已激活！'
          : '紧箍信物（好人绝境时激活）';
    } else if (self.role === 'oberon') {
      treasureSub = self.treasures?.bananaFan?.used
        ? '芭蕉神扇（已吹散）'
        : self.treasures?.bananaFan?.armed
          ? '🌪️ 聚风待发（通过则吹散）'
          : '芭蕉神扇（点击预设吹散）';
    } else if (self.role === 'assassin') {
      treasureSub = game?.phase === 'assassination'
        ? '🔥 终局刺杀 · 祭出火尖枪！'
        : '火尖枪（刺客专属神兵）';
    } else if (self.role === 'merlin') {
      treasureSub = '齐天大圣 · 无为而治（大隐潜行）';
    } else if (self.role === 'morgana') {
      treasureSub = '假美猴王 · 随心机变';
    } else {
      treasureSub = '混世妖仙 · 待机而动';
    }
  }

  return { enabled: canClickTreasure, description: treasureSub };
}
