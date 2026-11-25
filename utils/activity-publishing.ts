/** Retired Mini Program publishing stays closed; this is not a user permission decision. */
export const ACTIVITY_PUBLISH_UNAVAILABLE = '小程序活动发布暂不可用';

export function rejectMiniProgramActivityPublishing(): never {
  throw new Error(ACTIVITY_PUBLISH_UNAVAILABLE);
}
