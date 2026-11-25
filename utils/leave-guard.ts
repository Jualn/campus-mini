/** Page-owned native leave confirmation; no draft is persisted by this adapter. */
export function createLeaveGuard() {
  const owner = typeof getCurrentPages === 'function' ? getCurrentPages().slice(-1)[0] : undefined;
  let enabled = false;
  let desired = false;
  const apply = () => {
    // A background upload must not change the alert belonging to another editor.
    if (owner && getCurrentPages().slice(-1)[0] !== owner) return;
    if (enabled === desired) return;
    enabled = desired;
    if (desired && wx.canIUse('enableAlertBeforeUnload')) {
      wx.enableAlertBeforeUnload({ message: '还有未保存的内容或待确认的提交，确定离开吗？' });
    } else if (!desired && wx.canIUse('disableAlertBeforeUnload')) {
      wx.disableAlertBeforeUnload();
    }
  };
  return Object.assign(
    (dirty: boolean) => {
      desired = dirty;
      apply();
    },
    { resume: apply },
  );
}
