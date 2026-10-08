/** Hand-maintained consumer types from contracts/api/schemas/profile.yaml (2026-10-07).
 * The Contract, rather than this projection, owns protocol semantics.
 */
export interface UserProfile {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  bio: string;
  isPlatformOperator: boolean;
}

export interface UpdateMyProfileRequest {
  nickname?: string;
  avatarObjectKey?: string;
  backgroundObjectKey?: string;
  bio?: string;
}
