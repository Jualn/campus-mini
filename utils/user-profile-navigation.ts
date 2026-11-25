import { getCurrentIdentity } from '../actions/current-user';
import { buildUserProfileRoute } from './routes';
import { wxNavigateBack, wxNavigateTo } from './wx-promise';

let navigating = false;

function isProfileFor(
  page: WechatMiniprogram.Page.TrivialInstance | undefined,
  userId: string,
): boolean {
  if (page?.route !== 'subpkg_user/pages/user/user') return false;
  try {
    return decodeURIComponent(page.options.userId ?? '') === userId;
  } catch {
    return false;
  }
}

export async function openUserProfile(userId: string): Promise<void> {
  if (navigating || !userId || userId === getCurrentIdentity().id) return;

  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const previous = pages[pages.length - 2];
  if (isProfileFor(current, userId)) return;
  navigating = true;
  try {
    if (isProfileFor(previous, userId)) {
      await wxNavigateBack();
    } else {
      await wxNavigateTo({ url: buildUserProfileRoute(userId) });
    }
  } finally {
    navigating = false;
  }
}
