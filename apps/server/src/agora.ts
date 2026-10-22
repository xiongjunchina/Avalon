import agoraToken from 'agora-token';
const { RtcTokenBuilder, RtcRole } = agoraToken;

export const DEFAULT_AGORA_APP_ID = 'c07ff7d2dd764f5da6c86e914f8c0acc';
export const DEFAULT_AGORA_APP_CERTIFICATE = '973192302389494493d8188e0c4174c4';

export function getAgoraConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    appId: env.AGORA_APP_ID || DEFAULT_AGORA_APP_ID,
    certificate: env.AGORA_APP_CERTIFICATE || DEFAULT_AGORA_APP_CERTIFICATE,
  };
}

/**
 * Deterministically convert user UUID into a positive 32-bit integer UID for Agora RTC.
 * Range: 1 to 2,000,000,000
 */
export function uuidToRtcUid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = (Math.imul(31, hash) + uuid.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 2000000000) + 1;
}

export function generateVoiceToken(
  channelName: string,
  uid: number,
  config = getAgoraConfig()
): {
  appId: string;
  channel: string;
  token: string;
  uid: number;
} {
  const tokenExpireSeconds = 86400; // 24 hours in seconds
  const privilegeExpireSeconds = 86400; // 24 hours in seconds
  const token = RtcTokenBuilder.buildTokenWithUid(
    config.appId,
    config.certificate,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    tokenExpireSeconds,
    privilegeExpireSeconds
  );

  return {
    appId: config.appId,
    channel: channelName,
    token,
    uid,
  };
}
