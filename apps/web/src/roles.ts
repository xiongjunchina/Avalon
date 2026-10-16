import type { Role } from '@avalon/contracts';

export const roleNames: Record<Role,string> = {
  merlin:'梅林', percival:'派西维尔', guinevere:'桂妮薇儿', loyal:'忠臣', morgana:'莫甘娜',
  assassin:'刺客', mordred:'莫德雷德', oberon:'奥伯伦', minion:'爪牙',
};
export const roleMottos: Record<Role,string> = {
  merlin:'洞察暗影，藏好真相', percival:'辨认真伪，守护梅林', guinevere:'聆听传闻，寻觅暗影', loyal:'坚守忠诚，完成使命',
  morgana:'以假乱真，编织迷局', assassin:'伺机而动，寻找梅林', mordred:'隐于暗处，动摇圆桌',
  oberon:'独行暗影，隐秘为敌', minion:'潜伏圆桌，伺机破坏',
};
