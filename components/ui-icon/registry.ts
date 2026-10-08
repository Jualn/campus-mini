export const ICON_REGISTRY = {
  'chevron-left': {
    default: '/assets/icons/core/chevron-left.svg',
    inverse: '/assets/icons/core/chevron-left-inverse.svg',
  },
  'chevron-right': { default: '/assets/icons/core/chevron-right.svg' },
  close: { default: '/assets/icons/core/x.svg' },
  clear: { default: '/assets/icons/core/clear.svg' },
  remove: { default: '/assets/icons/core/x.svg', inverse: '/assets/icons/core/remove-inverse.svg' },
  plus: { default: '/assets/icons/core/plus.svg' },
  search: { default: '/assets/icons/core/search.svg' },
  'image-add': { default: '/assets/icons/core/image-add.svg' },
  send: { default: '/assets/icons/core/send.svg' },
  visibility: { default: '/assets/icons/core/eye.svg' },
  comment: { default: '/assets/icons/core/comment.svg' },
  reply: { default: '/assets/icons/core/comment.svg' },
  views: { default: '/assets/icons/core/eye.svg' },
  more: { default: '/assets/icons/core/more.svg' },
  preview: { default: '/assets/icons/core/preview.svg' },
  download: { default: '/assets/icons/core/download.svg' },
  location: { default: '/assets/icons/core/location.svg' },
  participants: { default: '/assets/icons/core/participants.svg' },
  contact: { default: '/assets/icons/core/contact.svg' },
  attachment: { default: '/assets/icons/core/attachment.svg' },
  file: { default: '/assets/icons/core/file.svg' },
  link: { default: '/assets/icons/core/link.svg' },
  home: { default: '/assets/icons/core/home.svg', active: '/assets/icons/core/home-active.svg' },
  message: {
    default: '/assets/icons/core/message.svg',
    active: '/assets/icons/core/message-active.svg',
  },
  user: { default: '/assets/icons/core/user.svg', active: '/assets/icons/core/user-active.svg' },
  settings: { default: '/assets/icons/core/settings.svg' },
  like: { default: '/assets/icons/core/like.svg', active: '/assets/icons/core/like-active.svg' },
  share: { default: '/assets/icons/core/share.svg' },
  'calendar-event': { default: '/assets/icons/core/calendar-event.svg' },
  checklist: { default: '/assets/icons/core/checklist.svg' },
} as const;

export type IconName = keyof typeof ICON_REGISTRY;
export type IconState = 'default' | 'active' | 'inverse';
export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

export const ICON_SIZE_RPX: Record<IconSize, number> = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
};

export interface IconResolution {
  src: string;
  unknownName: boolean;
  unsupportedState: boolean;
  invalidSize: boolean;
  resolvedSize: IconSize;
}

export function resolveIcon(name: string, state = 'default', size = 'md'): IconResolution {
  const descriptor = Object.prototype.hasOwnProperty.call(ICON_REGISTRY, name)
    ? ICON_REGISTRY[name as IconName]
    : undefined;
  const stateAsset =
    descriptor && Object.prototype.hasOwnProperty.call(descriptor, state)
      ? descriptor[state as keyof typeof descriptor]
      : undefined;
  const unsupportedState = !!descriptor && !stateAsset;
  const src = descriptor ? (stateAsset ?? descriptor.default) : '';
  const validSize = Object.prototype.hasOwnProperty.call(ICON_SIZE_RPX, size);
  const resolvedSize: IconSize = validSize ? (size as IconSize) : 'md';
  return {
    src,
    unknownName: !descriptor,
    unsupportedState,
    invalidSize: !validSize,
    resolvedSize,
  };
}
