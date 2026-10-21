import type { ScreenModel } from '../ui/widgets.js';

export function guideScreen(): ScreenModel {
  return { title: '玩法说明', subtitle: '嘻游 · 真假猴王', rows: [
    { id: 'guide:win', text: '五轮取经任务，蓝方完成三次后还须躲过刺杀' },
    { id: 'guide:loss', text: '红方破坏三次任务、累计五次流局或刺中孙悟空获胜' },
    { id: 'guide:role', text: '每人私下查看身份，讨论时不要展示底牌' },
    { id: 'guide:team', text: '队长选出任务队伍，按顺时针或逆时针发言' },
    { id: 'guide:vote', text: '全员赞成、反对或弃权；赞成多于反对才通过' },
    { id: 'guide:mission', text: '队员匿名出成功或失败；蓝方只能出成功' },
    { id: 'guide:assassin', text: '三次成功后由红孩儿刺杀孙悟空' },
    { id: 'guide:lady', text: '照妖宝镜与提前刺杀由房主开局前设置' },
    { id: 'back', text: '返回' },
  ] };
}
