export type ActivityUiStatus =
  | 'not_started' // 未开始（报名未开放）
  | 'enrolling' // 报名中
  | 'ongoing' // 进行中（报名已截止，活动进行中）
  | 'ended' // 已结束
  | 'cancelled';

export type TimelineNodeStatus = 'done' | 'active' | 'pending';

export interface TimelineNode {
  label: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  // source: string;
  note: string;
  status: TimelineNodeStatus;
}

interface JoinMethodBase {
  label: string;
  note: string;
}

export interface JoinMethodQQ extends JoinMethodBase {
  type: 'qq';
  group_id: string;
}

export interface JoinMethodEmail extends JoinMethodBase {
  type: 'email';
  email: string;
}

export interface JoinMethodQRCode extends JoinMethodBase {
  type: 'qrcode';
  image_url: string;
}

export interface JoinMethodWeChat extends JoinMethodBase {
  type: 'wechat';
  account: string;
}

export interface JoinMethodLink extends JoinMethodBase {
  type: 'link';
  url: string;
}

export type JoinMethod =
  | JoinMethodQQ
  | JoinMethodEmail
  | JoinMethodQRCode
  | JoinMethodWeChat
  | JoinMethodLink;

export interface Reward {
  level: string;
  count: number | null;
  prize: string;
  note: string;
}

export interface Contact {
  name: string;
  role?: string;
  phone?: string;
  qq?: string;
  email?: string;
  note?: string;
}

export interface Attachment {
  type: string;
  name: string;
  url: string;
  note?: string;
}
