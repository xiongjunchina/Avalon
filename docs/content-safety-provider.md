# 内容安全服务接口依据

核对日期：2026-11-03。以下为本次读取的微信官方新文档；旧地址可能只显示迁移页面。

- [小游戏文本内容安全识别](https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_gamemsgseccheck.html)：使用游戏专用 v2 接口；资料场景为 1，聊天场景为 5。调用成功不等于内容通过，必须检查 `result.suggest`。
- [小游戏图片内容安全识别](https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_gamesecurity.mediacheck.html)：支持同步图片检测，输入为可下载图片 URL，资料头像使用场景 1。应用先保存不可变图片至受控的待审地址，通过后才公开。
- [稳定版接口凭据](https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-access-token/api_getstableaccesstoken.html)：普通模式不强制使旧 token 失效，服务端缓存并合并并发请求。

两个游戏专用接口均要求用户 openid；无微信身份时不能伪造、借用别人的 openid 或静默降级到旧 v1 接口。纯网页及历史内容由适用的独立审核服务或人工审核流程处理。接口可能因账号权限、额度或网络状态不可用，部署前必须用目标 AppID 实测，mock 测试不能证明账号权限已开通。

`WechatContentSafetyProvider` 将一次检查（含取 token 和最多一次 token 失效重试）限制在 5.5 秒内。身份缺失或无效返回 `CONTENT_IDENTITY_REQUIRED`；服务异常返回 `CONTENT_CHECK_UNAVAILABLE`。不把上游 URL、凭据、原始内容或异常文本暴露给客户端。

## 管理员上线能力预检

在 ECS 上运行以下只读数据预检。先让**专门的验收账号**在目标小游戏正常登录，再把示例 `PROBE_PLAYER_CODE=123456` 替换为该账号的仙友码。命令从数据库读取该账号真实绑定的 openid，不打印身份或凭据，不修改用户、房间、战绩或头像。不得随意借用其他玩家的 openid，不得通过假造字符串测试成正式支持。

预检会真实调用微信 API，消耗少量接口额度；仅使用无害的测试文字和现有内置法宝头像。容器名称须先与实际部署核对。**不要启用 `set -x`，不要打印环境变量、完整请求 URL、原始响应或 token。**

```bash
docker exec -i -e PROBE_PLAYER_CODE=123456 avalon-ecs-server-1 node --input-type=module <<'NODE'
import pg from 'pg';

let stage = 'configuration';
let pool;
const emit = record => console.log(JSON.stringify(record));
const post = async (name, url, body) => {
  stage = name;
  const response = await fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  emit({
    stage: name, httpStatus: response.status,
    errcode: typeof data.errcode === 'number' ? data.errcode : null,
    decision: ['pass', 'risky', 'review'].includes(data.result?.suggest) ? data.result.suggest : null,
    traceId: typeof data.trace_id === 'string' && data.trace_id.length <= 256 ? data.trace_id : null,
    ...(name === 'stable-token' ? { tokenAvailable: Boolean(data.access_token) } : {}),
  });
  if (!response.ok) throw new Error('PROBE_HTTP_FAILURE');
  if (name !== 'stable-token' && (data.errcode !== 0 || data.result?.suggest !== 'pass'))
    process.exitCode = 1;
  return data;
};

try {
  const appId = process.env.WECHAT_MINIGAME_APP_ID;
  const secret = process.env.WECHAT_MINIGAME_APP_SECRET;
  const code = process.env.PROBE_PLAYER_CODE;
  if (!appId || !secret || !process.env.DATABASE_URL || !/^\d{6}$/.test(code ?? ''))
    throw new Error('PROBE_CONFIG_REQUIRED');
  stage = 'test-account';
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const row = (await pool.query(
    'SELECT wechat_openid FROM users WHERE player_code=$1 AND wechat_openid IS NOT NULL', [code]
  )).rows[0];
  if (!row?.wechat_openid) throw new Error('PROBE_WECHAT_TEST_ACCOUNT_REQUIRED');
  const credentials = await post('stable-token', 'https://api.weixin.qq.com/cgi-bin/stable_token', {
    grant_type: 'client_credential', appid: appId, secret, force_refresh: false,
  });
  if (typeof credentials.access_token !== 'string' || !credentials.access_token)
    throw new Error('PROBE_TOKEN_UNAVAILABLE');
  const suffix = '?access_token=' + encodeURIComponent(credentials.access_token);
  const shared = { openid: row.wechat_openid, version: 2 };
  await post('nickname', 'https://api.weixin.qq.com/wxa/game/content_spam/msg_sec_check' + suffix,
    { ...shared, scene: 1, content: '发布自检仙友' });
  await post('chat', 'https://api.weixin.qq.com/wxa/game/content_spam/msg_sec_check' + suffix,
    { ...shared, scene: 5, content: '大家好，请按顺序发言。' });
  await post('avatar', 'https://api.weixin.qq.com/wxa/game/content_spam/media_check_sync' + suffix,
    { ...shared, scene: 1, media_type: 2,
      media_url: 'https://game.ccnepower.com/avalon/art/avatars/wx-1.webp?v=artifact1' });
} catch {
  // Never print an exception: a network implementation may include the token URL.
  emit({ stage, error: 'PROBE_FAILED', instruction: 'Check the sanitized stage result and private configuration.' });
  process.exitCode = 1;
} finally {
  await pool?.end();
}
NODE
```

通过标准：三个内容检查都返回 `errcode:0` 且 `decision:"pass"`，不能仅依据 token 可获取或 HTTP 200 判定已开通。`750031` 表示该游戏尚不支持，需联系小游戏侧配置；`40003` / `43104` 需要重新核实目标 AppID 与验收账号真实身份；额度、超时或其他异常不得作为放行结果。以上预检只证明接口连通和无害样本通过，拦截、待审、异常和双端互通仍须进行应用层验收。
