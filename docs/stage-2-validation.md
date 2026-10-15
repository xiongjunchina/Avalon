# 阶段2 本地验证记录

## 已交付

2026-09-30：TypeScript 工作区、React/Vite 手机网页、Fastify/WebSocket 服务、Zod 消息契约、npm 锁文件。没有任何 RTC 依赖、音频采集或麦克风入口。

可操作范围：访客昵称进入、创建／加入等待房间、邀请链接、人数与规则开关、准备／取消准备、退出、成员连接状态、刷新恢复、新标签接管、房主主动离开转交。UI 明确标注内存版限制，不展示虚构的可开局按钮或真实战绩。

## 验证证据

- `npm run typecheck`：通过。
- `npm test`：6组集成测试全部通过，0失败。包括独立用户同步、越权与跨源请求拒绝、人数上限、重复加入、重复命令幂等、版本冲突、修改设置取消准备、重新连接、标签接管、主动离房转交及空房删除。
- `npm run build`：通过，Vite 输出网页资源；不是后端部署验收。
- Codex 内置浏览器，手机宽度：测试访客成功进入、创建6人房间、连接成功、准备成功；刷新后同一座位与准备状态保留。截图见 stage-2-room.png。
- 依赖安装时 npm 审计报告0漏洞；仅代表安装当时的数据库结果。

## 未验收与临时边界

本阶段数据在内存中，重启即失效；不保存正式战绩。没有接入 PostgreSQL，不支持开局与完整游戏。固定会话有效期、房间过期清理、离线60秒自动转交的定时边界、客户端网络切换与退后台恢复还需后续补充测试。

尚未开放局域网／公网，没有 HTTPS 测试入口，未做 iPhone／Android 微信真机验收。自动化多客户端通过不等于真实多手机通过。网页构建成功不等于可生产发布。

默认访问 localhost:5173，后端本机3001。当前APP_ORIGIN必须与网页地址一致。正式部署需要HTTPS、Secure Cookie、受控Origin和可信代理配置；本阶段不向外发布。

## 实现参考

WebSocket 握手与同步监听方式参考 [Fastify WebSocket 官方文档](https://github.com/fastify/fastify-websocket)；开发代理参考 [Vite server options](https://vite.dev/config/server-options.html)。实际依赖版本以 package-lock.json 为准。
