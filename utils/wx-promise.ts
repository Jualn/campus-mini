// wx-promise.ts

// ── 工具类型 ──────────────────────────────────────────────────────────

interface WxCallbackOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  success?: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fail?: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  complete?: (...args: any[]) => void;
}

type WxResult<O> = O extends { success?: (res: infer R) => void } ? R : never;

type Promisify<O extends WxCallbackOpts> = (
  opts?: Omit<O, 'success' | 'fail' | 'complete'>, // 加 ?
) => Promise<WxResult<O>>;

function wrap<O extends WxCallbackOpts>(fn: (opts: O) => void): Promisify<O> {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    opts = {} as any, // 默认值 {}
  ) =>
    new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      fn({ ...(opts as any), success: resolve, fail: reject });
    });
}

// ── 异步 API ────────────────────────────────────────────────────────────

// 登录 / 权限
export const wxLogin = wrap<WechatMiniprogram.LoginOption>((o) => {
  void wx.login(o);
});
export const wxAuthorize = wrap<WechatMiniprogram.AuthorizeOption>((o) => {
  void wx.authorize(o);
});
export const wxOpenSetting = wrap<WechatMiniprogram.OpenSettingOption>((o) => {
  void wx.openSetting(o);
});
export const wxGetSetting = wrap<WechatMiniprogram.GetSettingOption>((o) => {
  void wx.getSetting(o);
});
export const wxGetUserProfile = wrap<WechatMiniprogram.GetUserProfileOption>((o) => {
  void wx.getUserProfile(o);
});
export const wxCheckSession = wrap<WechatMiniprogram.CheckSessionOption>((o) => {
  void wx.checkSession(o);
});

// 存储
export const wxGetStorage = wrap<WechatMiniprogram.GetStorageOption>((o) => {
  void wx.getStorage(o);
});
export const wxSetStorage = wrap<WechatMiniprogram.SetStorageOption>((o) => {
  void wx.setStorage(o);
});
export const wxRemoveStorage = wrap<WechatMiniprogram.RemoveStorageOption>((o) => {
  void wx.removeStorage(o);
});
export const wxClearStorage = wrap<WechatMiniprogram.ClearStorageOption>((o) => {
  void wx.clearStorage(o);
});

// 网络
export const wxRequest = wrap<WechatMiniprogram.RequestOption>((o) => {
  void wx.request(o);
});
export const wxUploadFile = wrap<WechatMiniprogram.UploadFileOption>((o) => {
  void wx.uploadFile(o);
});
export const wxDownloadFile = wrap<WechatMiniprogram.DownloadFileOption>((o) => {
  void wx.downloadFile(o);
});

// 图片 / 媒体
export const wxChooseMessageFile = wrap<WechatMiniprogram.ChooseMessageFileOption>((o) => {
  void wx.chooseMessageFile(o);
});
export const wxChooseMedia = wrap<WechatMiniprogram.ChooseMediaOption>((o) => {
  void wx.chooseMedia(o);
});
export const wxGetImageInfo = wrap<WechatMiniprogram.GetImageInfoOption>((o) => {
  void wx.getImageInfo(o);
});
export const wxPreviewImage = wrap<WechatMiniprogram.PreviewImageOption>((o) => {
  void wx.previewImage(o);
});
export const wxSaveImageToPhotosAlbum = wrap<WechatMiniprogram.SaveImageToPhotosAlbumOption>(
  (o) => {
    void wx.saveImageToPhotosAlbum(o);
  },
);

// 位置
export const wxGetLocation = wrap<WechatMiniprogram.GetLocationOption>((o) => {
  void wx.getLocation(o);
});
export const wxChooseLocation = wrap<WechatMiniprogram.ChooseLocationOption>((o) => {
  void wx.chooseLocation(o);
});
export const wxOpenLocation = wrap<WechatMiniprogram.OpenLocationOption>((o) => {
  void wx.openLocation(o);
});

// 支付
export const wxRequestPayment = wrap<WechatMiniprogram.RequestPaymentOption>((o) => {
  void wx.requestPayment(o);
});

// 剪贴板
export const wxGetClipboardData = wrap<WechatMiniprogram.GetClipboardDataOption>((o) => {
  void wx.getClipboardData(o);
});
export const wxSetClipboardData = wrap<WechatMiniprogram.SetClipboardDataOption>((o) => {
  void wx.setClipboardData(o);
});

export const wxPageScrollTo = wrap<WechatMiniprogram.PageScrollToOption>((o) => {
  void wx.pageScrollTo(o);
});

export const wxHideKeyboard = wrap<WechatMiniprogram.HideKeyboardOption>((o) => {
  void wx.hideKeyboard(o);
});
// ── 同步 API ────────────────────────────────────────────────────────────

// 存储（数据量小时可用）
export const wxGetStorageSync = (key: string): unknown => wx.getStorageSync(key);
export const wxSetStorageSync = (key: string, data: unknown) => {
  wx.setStorageSync(key, data);
};
export const wxRemoveStorageSync = (key: string) => {
  wx.removeStorageSync(key);
};
export const wxClearStorageSync = () => {
  wx.clearStorageSync();
};

// 系统信息

export const wxGetAccountInfoSync = () => wx.getAccountInfoSync();
export const wxGetWindowInfo = () => wx.getWindowInfo();
export const wxGetDeviceInfo = () => wx.getDeviceInfo();
export const wxGetAppBaseInfo = () => wx.getAppBaseInfo();

// 工具
export const wxCanIUse = (schema: string) => wx.canIUse(schema);

// ── 无需结果的 UI API ───────────────────────────────────────────────────

export const wxShowToast = (opts: WechatMiniprogram.ShowToastOption) => wx.showToast(opts);
export const wxHideToast = () => wx.hideToast();
export const wxShowLoading = (opts: WechatMiniprogram.ShowLoadingOption) => wx.showLoading(opts);
export const wxHideLoading = () => wx.hideLoading();
export const wxShowModal = wrap<WechatMiniprogram.ShowModalOption>((o) => {
  void wx.showModal(o);
});
export const wxShowActionSheet = wrap<WechatMiniprogram.ShowActionSheetOption>((o) => {
  void wx.showActionSheet(o);
});
export const wxShowShareMenu = (opts: WechatMiniprogram.ShowShareMenuOption) =>
  wx.showShareMenu(opts);

// 监听 / 取消监听成对封装
export const wxOnKeyboardHeightChange = (cb: WechatMiniprogram.OnKeyboardHeightChangeCallback) => {
  wx.onKeyboardHeightChange(cb);
};
export const wxOffKeyboardHeightChange = (
  cb?: WechatMiniprogram.OnKeyboardHeightChangeCallback,
) => {
  wx.offKeyboardHeightChange(cb);
};

// 路由
export const wxNavigateTo = (opts: WechatMiniprogram.NavigateToOption) => wx.navigateTo(opts);
export const wxRedirectTo = (opts: WechatMiniprogram.RedirectToOption) => wx.redirectTo(opts);
export const wxSwitchTab = (opts: WechatMiniprogram.SwitchTabOption) => wx.switchTab(opts);
export const wxNavigateBack = (opts?: WechatMiniprogram.NavigateBackOption) =>
  wx.navigateBack(opts);
export const wxReLaunch = (opts: WechatMiniprogram.ReLaunchOption) => wx.reLaunch(opts);

// ── 带业务逻辑的封装 ──────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  content: string;
}

// 弹确认框（直接返回 boolean，不用判断 confirm 字段）
export const showConfirm = async ({ title, content }: ConfirmOptions): Promise<boolean> => {
  const res = await wxShowModal({ title, content, confirmText: '确认', cancelText: '取消' });
  return res.confirm;
};

// 选图片（返回临时路径数组）
export const chooseImages = async (count = 1): Promise<string[]> => {
  try {
    const res = await wxChooseMedia({
      count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    });

    return res.tempFiles.map((f) => f.tempFilePath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    if (e?.errMsg?.includes('cancel')) {
      return []; // 取消 = 正常流程
    }

    throw e; // 不要吞真正错误
  }
  const res = await wxChooseMedia({
    count,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
  });
  return res.tempFiles.map((f) => f.tempFilePath);
};

interface ChooseMessageFileOptions {
  count?: number;
  type?: 'all' | 'video' | 'image' | 'file';
  extension?: string[];
}

interface ChosenMessageFile {
  name: string;
  path: string;
  size?: number;
  time?: number;
}

// 选聊天会话文件（返回文件名、临时路径及元信息）
export const chooseMessageFile = async (
  options: ChooseMessageFileOptions = {},
): Promise<ChosenMessageFile[]> => {
  const { count = 1, type = 'all', extension } = options;
  const res = await wxChooseMessageFile({ count, type, extension });
  return res.tempFiles.map((f) => ({
    name: f.name,
    path: f.path,
    size: f.size,
    time: f.time,
  }));
};

// 检查并申请权限（被拒后引导去设置页）
export const requireAuth = async (scope: keyof WechatMiniprogram.AuthSetting): Promise<boolean> => {
  const { authSetting } = await wxGetSetting();
  if (authSetting[scope]) return true;

  try {
    await wxAuthorize({ scope });
    return true;
  } catch {
    const confirmed = await showConfirm({
      title: '需要授权',
      content: '请在设置页开启相关权限',
    });
    if (confirmed) void wxOpenSetting();
    return false;
  }
};
