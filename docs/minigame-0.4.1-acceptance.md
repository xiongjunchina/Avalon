# Mini Game 0.4.1 candidate — 2026-11-01

Baseline: origin/main 976750a. Service: https://game.ccnepower.com/avalon.

- Personal-center tab switching and local profile selection do not emit the global waiting toast. Writes retain progress/error handling.
- Avatar selection requests privacy authorization when available, uses an export-capable Canvas rather than assuming OffscreenCanvas supports file export, reports denied photo access, treats cancellation quietly, and bounds image decoding time.
- Built-client regression drives the visible upload button, verifies the selected image is included in PATCH /me, and checks pending history navigation paints no waiting toast.
- Native WeChat voice is enabled by default in new builds; explicit WECHAT_MINIGAME_VOICE_ENABLED=false remains supported. Voice is independent of web Agora. Existing client/server enforce the official ten-member limit, room membership and WeChat identity checks.

## External acceptance still required

- MP backend → 游戏能力地图 → 实时语音 → 申请开通. Official reference: https://developers.weixin.qq.com/minigame/dev/guide/open-ability/voip-chat.html
- Server must set WECHAT_MINIGAME_VOICE_ENABLED=true and have the matching WeChat AppID/AppSecret. These production settings have not been inspected or modified in this change.
- Two physical phones must verify joining, microphone/speaker controls, leaving and backgrounding. Unit mocks and developer-tool compilation cannot establish actual audio quality or capability approval.
- Phone avatar selection and persisted profile readback remain device acceptance items. Local built-client tests mock the native photo picker and HTTP responses.
- Public health endpoint returned HTTP 200 with PostgreSQL status ok. This does not prove authenticated voice availability.

Do not treat this candidate as a fully accepted experience release or formal publication.
