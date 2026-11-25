import { createBusinessSubscription } from '../../../services/business-subscriptions';
import { isReadAccessError } from '../../../utils/error';
import { createLeaveGuard } from '../../../utils/leave-guard';
import definePage from '../../../utils/definePage';
import { watchPersonBinding } from '../../../services/person-binding';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import { chooseMessageFile } from '../../../utils/wx-promise';
import {
  getMyLearningTask,
  getMyLearningTaskFile,
  getMyLearningTaskFileAccess,
  assertLearningSubject,
  getMyLearningTaskSubmission,
  listMyLearningTaskSubmissions,
  learningTaskError,
  resourceId,
  requireSubmission,
  type MyDetail,
  type Submission,
} from '../../services/learning-task';
import {
  presentation,
  textLength,
  validateSubmission,
  submissionBody,
  selectedFile,
  submissionPresentation,
  type SelectedFile,
} from '../../services/learning-task-state';
import {
  uploadLearningFile,
  newFileUploadAttempt,
  type FileUploadAttempt,
} from '../../services/learning-task-files';
import { pendingOperation, runLearningOperation } from '../../services/learning-task-operation';

definePage({
  _businessSubscription: null as ReturnType<typeof createBusinessSubscription> | null,
  data: {
    detail: null as MyDetail | null,
    view: null as ReturnType<typeof presentation> | null,
    loading: false,
    error: '',
    history: [] as (Submission & ReturnType<typeof submissionPresentation>)[],
    historyError: '',
    historyLoading: false,
    historyMore: false,
    latest: null as (Submission & ReturnType<typeof submissionPresentation>) | null,
    latestError: '',
    text: '',
    textCount: 0,
    confirmed: false,
    files: [] as SelectedFile[],
    selecting: false,
    submitting: false,
    feedback: '',
    feedbackTone: 'info',
    unresolved: false,
    versionReady: false,
    uploading: false,
    uploadProgress: 0,
    openingFile: false,
    videoUrl: '',
    videoFileId: '',
  },
  _uploadAttempts: new Map<string, FileUploadAttempt>(),
  _accessTimer: null as ReturnType<typeof setTimeout> | null,
  _downloads: [] as string[],
  _fileEpoch: 0,
  _id: '',
  _etag: '',
  _generation: 0,
  _historyGeneration: 0,
  _historyPage: 0,
  _historyFailedAppend: false,
  _alive: true,
  _owner: '',
  _visible: false,
  _identityRevision: 0,
  _deadlineTimer: null as ReturnType<typeof setTimeout> | null,
  _leaveGuard: null as ReturnType<typeof createLeaveGuard> | null,
  _off: null as (() => void) | null,
  _offBinding: null as (() => void) | null,
  onLoad(options: { assignmentId?: string }) {
    this._leaveGuard = createLeaveGuard();
    this._businessSubscription = createBusinessSubscription(() => this._alive);
    this._uploadAttempts = new Map();
    this._downloads = [];
    try {
      this._id = resourceId(options.assignmentId);
    } catch {
      this._id = '';
    }
    this._owner = getCurrentIdentity().id;
    this._offBinding = watchPersonBinding(() => {
      if (this.data.detail?.assignment.subject.type === 'ACCOUNT') return;
      this._leaveGuard?.(false);
      this.clearPrivateFiles();
      ++this._identityRevision;
      ++this._generation;
      ++this._historyGeneration;
      this._etag = '';
      this.clearDeadlineTimer();
      this.setData({
        detail: null,
        view: null,
        history: [],
        latest: null,
        text: '',
        textCount: 0,
        confirmed: false,
        files: [],
        uploading: false,
        selecting: false,
        openingFile: false,
        unresolved: false,
        submitting: false,
        versionReady: false,
      });
      if (this._visible) void this.load();
    });
    this._off = watchCurrentIdentity(() => {
      const owner = getCurrentIdentity().id;
      if (owner === this._owner) return;
      this._owner = owner;
      this._leaveGuard?.(false);
      this.clearPrivateFiles();
      ++this._identityRevision;
      ++this._generation;
      ++this._historyGeneration;
      this._etag = '';
      this.setData({
        detail: null,
        view: null,
        history: [],
        latest: null,
        text: '',
        textCount: 0,
        confirmed: false,
        files: [],
        uploading: false,
        selecting: false,
        openingFile: false,
        unresolved: false,
        submitting: false,
      });
      if (this._visible) void this.load();
    });
  },
  onShow() {
    void this._businessSubscription?.prepare('LEARNING_SUBMIT');
    if (this._businessSubscription?.pending) return;
    this._leaveGuard?.resume();
    this._visible = true;
    this.clearDownloads();
    void this.load();
  },
  onHide() {
    if (this._businessSubscription?.pending) return;
    this._visible = false;
    this._etag = '';
    this.setData({ versionReady: false });
    this.clearDeadlineTimer();
    this.closeVideo();
    ++this._fileEpoch;
    this.setData({ openingFile: false });
    ++this._generation;
    ++this._historyGeneration;
  },
  onUnload() {
    this._businessSubscription?.dispose();
    this._visible = false;
    this.clearDeadlineTimer();
    this.clearPrivateFiles();
    this._alive = false;
    ++this._generation;
    ++this._historyGeneration;
    this._off?.();
    this._offBinding?.();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  refresh() {
    void this.load();
  },
  isCurrent(generation: number, owner: string) {
    return this._alive && generation === this._generation && owner === getCurrentIdentity().id;
  },
  isSameSession(owner: string, revision: number) {
    return this._alive && owner === getCurrentIdentity().id && revision === this._identityRevision;
  },
  clearDeadlineTimer() {
    if (this._deadlineTimer !== null) clearTimeout(this._deadlineTimer);
    this._deadlineTimer = null;
  },
  scheduleDeadline() {
    this.clearDeadlineTimer();
    const d = this.data.detail;
    if (!d || !presentation(d).canAct) return;
    const deadline = presentation(d).deadline;
    this._deadlineTimer = setTimeout(
      () => {
        this._deadlineTimer = null;
        const current = this.data.detail;
        if (!current || !this._alive) return;
        this.setData({ view: presentation(current) });
        if (presentation(current).canAct) this.scheduleDeadline();
        else void this.load();
      },
      Math.min(60000, Math.max(1, Date.parse(deadline) - Date.now())),
    );
  },
  async load() {
    if (!this._alive || this.data.uploading || this.data.selecting || this.data.submitting) return;
    this.clearDeadlineTimer();
    if (!this._id) {
      this.setData({ error: '学习任务地址无效', detail: null, view: null });
      return;
    }
    const generation = ++this._generation,
      owner = getCurrentIdentity().id;
    ++this._historyGeneration;
    this._etag = '';
    this.setData({
      loading: !this.data.detail,
      error: '',
      latestError: '',
      historyError: '',
      historyLoading: false,
      historyMore: false,
      versionReady: false,
      unresolved: !!pendingOperation(this._id),
      submitting: !!pendingOperation(this._id)?.running,
    });
    try {
      const result = await getMyLearningTask(this._id);
      if (!this.isCurrent(generation, owner)) return;
      if (
        getCurrentIdentity().id &&
        result.detail.assignment.subject.type === 'ACCOUNT' &&
        result.detail.assignment.subject.userId !== getCurrentIdentity().id
      )
        throw new Error('任务分配身份不匹配');
      this._etag = result.etag;
      this.setData({
        detail: result.detail,
        view: presentation(result.detail),
        versionReady: /^"[^"\r\n]+"$/.test(result.etag),
      });
      void this.loadHistory();
      void this.loadLatest();
      this.scheduleDeadline();
    } catch (e) {
      if (this.isCurrent(generation, owner))
        this.setData({
          error: learningTaskError(e),
          ...(isReadAccessError(e) ? { detail: null, view: null, history: [], latest: null } : {}),
        });
    } finally {
      if (this.isCurrent(generation, owner)) this.setData({ loading: false });
    }
  },
  async loadLatest() {
    const d = this.data.detail,
      generation = this._generation,
      owner = getCurrentIdentity().id;
    if (!d?.assignment.latestSubmissionId) {
      this.setData({ latest: null });
      return;
    }
    if (this.data.latest?.submissionId !== d.assignment.latestSubmissionId)
      this.setData({ latest: null });
    try {
      const s = await getMyLearningTaskSubmission(this._id, d.assignment.latestSubmissionId);
      requireSubmission(s, d.assignment.assignmentId);
      if (this.isCurrent(generation, owner))
        this.setData({
          latest: { ...s, ...submissionPresentation(s) },
          latestError: '',
        });
    } catch (e) {
      if (this.isCurrent(generation, owner))
        this.setData({
          latestError: learningTaskError(e),
          ...(isReadAccessError(e) ? { latest: null } : {}),
        });
    }
  },
  retryLatest() {
    void this.loadLatest();
  },
  async loadHistory(append = false) {
    const d = this.data.detail;
    if (!d || (append && this.data.historyLoading)) return;
    const generation = ++this._historyGeneration,
      pageGeneration = this._generation,
      page = append ? this._historyPage + 1 : 1;
    this.setData({ historyLoading: true, historyError: '' });
    try {
      const result = await listMyLearningTaskSubmissions(this._id, page);
      result.items.forEach((s) => requireSubmission(s, d.assignment.assignmentId));
      if (
        !this._alive ||
        generation !== this._historyGeneration ||
        pageGeneration !== this._generation
      )
        return;
      this._historyPage = page;
      const items = result.items.map((s) => ({ ...s, ...submissionPresentation(s) }));
      this.setData({
        history: append ? [...this.data.history, ...items] : items,
        historyMore: result.page * result.pageSize < result.totalItems,
      });
    } catch (e) {
      if (
        this._alive &&
        generation === this._historyGeneration &&
        pageGeneration === this._generation
      ) {
        this._historyFailedAppend = append;
        this.setData({
          historyError: learningTaskError(e),
          ...(isReadAccessError(e) ? { history: [], historyMore: false } : {}),
        });
      }
    } finally {
      if (this._alive && generation === this._historyGeneration)
        this.setData({ historyLoading: false });
    }
  },
  retryHistory() {
    void this.loadHistory(this._historyFailedAppend);
  },
  moreHistory() {
    if (this.data.historyMore) void this.loadHistory(true);
  },
  input(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (this.data.submitting || this.data.unresolved || this.data.uploading) return;
    this.setData({ text: e.detail.value, textCount: textLength(e.detail.value), feedback: '' });
    this.syncLeaveGuard();
  },
  syncLeaveGuard() {
    this._leaveGuard?.(
      !!this.data.text || this.data.confirmed || !!this.data.files.length || this.data.unresolved,
    );
  },
  toggleConfirm(e: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    if (!this.data.submitting && !this.data.unresolved)
      this.setData({ confirmed: e.detail.value.includes('confirmed') });
    this.syncLeaveGuard();
  },
  async chooseFiles() {
    const d = this.data.detail;
    if (
      !d ||
      !presentation(d).canAct ||
      !this.data.versionReady ||
      this.data.submitting ||
      this.data.uploading ||
      this.data.unresolved ||
      this.data.selecting
    )
      return;
    const remaining = d.task.requirements.maximumFiles - this.data.files.length;
    if (remaining <= 0) return;
    const owner = getCurrentIdentity().id;
    const revision = this._identityRevision;
    this.setData({ selecting: true, feedback: '' });
    try {
      const files = await chooseMessageFile({ count: remaining, type: 'all' });
      if (!this.isSameSession(owner, revision)) return;
      const mapped = files.map((f) =>
        selectedFile(f.name, f.path, f.size, d.task.requirements.allowedFileKinds),
      );
      this.setData({
        files: [
          ...this.data.files,
          ...mapped.filter((f) => !this.data.files.some((existing) => existing.path === f.path)),
        ].slice(0, d.task.requirements.maximumFiles),
        feedback: '附件已选择，请上传并登记后提交',
        feedbackTone: 'info',
      });
    } catch (e) {
      if (
        this.isSameSession(owner, revision) &&
        !(e as { errMsg?: string } | null)?.errMsg?.includes('cancel')
      )
        this.setData({ feedback: learningTaskError(e), feedbackTone: 'warning' });
    } finally {
      if (this.isSameSession(owner, revision)) {
        this.setData({ selecting: false });
        this.syncLeaveGuard();
        if (this._visible && !this._etag) void this.load();
      }
    }
  },
  removeFile(e: WechatMiniprogram.TouchEvent) {
    if (this.data.submitting || this.data.unresolved || this.data.uploading) return;
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.files.length) return;
    const removed = this.data.files[index];
    this._uploadAttempts.delete(removed.path);
    this.setData({ files: this.data.files.filter((_, i) => i !== index) });
    this.syncLeaveGuard();
  },
  openArticle() {
    const article = this.data.detail?.task.article;
    if (article?.availability === 'AVAILABLE')
      void wx.navigateTo({
        url: `/subpkg_red/pages/article-detail/detail?articleId=${encodeURIComponent(article.articleId)}`,
      });
  },
  clearDownloads() {
    for (const filePath of this._downloads)
      wx.getFileSystemManager().unlink({
        filePath,
        fail: () => {
          /* Already reclaimed temporary files require no recovery. */
        },
      });
    this._downloads = [];
  },
  closeVideo() {
    if (this._accessTimer !== null) clearTimeout(this._accessTimer);
    this._accessTimer = null;
    this.setData({ videoUrl: '', videoFileId: '' });
  },
  clearPrivateFiles() {
    ++this._fileEpoch;
    this.closeVideo();
    this.clearDownloads();
    this._uploadAttempts.clear();
  },
  async uploadFiles() {
    const detail = this.data.detail;
    if (
      !detail ||
      !presentation(detail).canAct ||
      !this.data.versionReady ||
      this.data.uploading ||
      this.data.submitting ||
      this.data.unresolved ||
      this.data.selecting
    )
      return;
    const owner = getCurrentIdentity().id,
      revision = this._identityRevision;
    const current = () => {
      if (!this.isSameSession(owner, revision)) throw new Error('账号或绑定已变化，请重新选择');
    };
    this.setData({ uploading: true, feedback: '', uploadProgress: 0 });
    try {
      for (let index = 0; index < this.data.files.length; index++) {
        current();
        await assertLearningSubject(detail.assignment.subject);
        current();
        const file = this.data.files[index];
        if (
          file.fileId &&
          (!file.unboundExpiresAt || Date.parse(file.unboundExpiresAt) > Date.now())
        )
          continue;
        if (file.fileId) throw new Error('附件候选已到期，请移除后重新选择上传');
        const attempt = this._uploadAttempts.get(file.path) ?? newFileUploadAttempt();
        this._uploadAttempts.set(file.path, attempt);
        const registered = await uploadLearningFile(this._id, file, attempt, current, (percent) => {
          if (this.isSameSession(owner, revision)) this.setData({ uploadProgress: percent });
        });
        current();
        const files = [...this.data.files];
        files[index] = {
          ...file,
          status: '已登记',
          fileId: registered.fileId,
          unboundExpiresAt: registered.unboundExpiresAt,
        };
        this.setData({ files });
      }
      this.setData({
        feedback: '附件已登记，正式提交后保留为成果历史',
        feedbackTone: 'success',
      });
    } catch (error) {
      if (this.isSameSession(owner, revision))
        this.setData({ feedback: learningTaskError(error), feedbackTone: 'warning' });
    } finally {
      if (this.isSameSession(owner, revision)) {
        this.setData({ uploading: false });
        if (this._visible && !this._etag) void this.load();
      }
    }
  },
  async openFile(e: WechatMiniprogram.TouchEvent) {
    const fileId = resourceId(e.currentTarget.dataset.id);
    const detail = this.data.detail;
    if (
      !detail ||
      this.data.openingFile ||
      !this.data.history.some((s) => s.fileIds?.includes(fileId))
    )
      return;
    const epoch = ++this._fileEpoch,
      owner = getCurrentIdentity().id,
      revision = this._identityRevision;
    const current = () =>
      this.isSameSession(owner, revision) && epoch === this._fileEpoch && this._visible;
    this.closeVideo();
    this.setData({ openingFile: true, feedback: '' });
    try {
      await assertLearningSubject(detail.assignment.subject);
      if (!current()) return;
      const file = await getMyLearningTaskFile(this._id, fileId);
      if (!current()) return;
      const access = await getMyLearningTaskFileAccess(this._id, fileId);
      if (!current()) return;
      if (file.kind === 'VIDEO') {
        this.setData({ videoUrl: access.url, videoFileId: fileId });
        this._accessTimer = setTimeout(
          () => {
            if (current()) {
              this.closeVideo();
              this.setData({
                feedback: '播放授权已到期，请重新打开附件获取授权',
                feedbackTone: 'warning',
              });
            }
          },
          Math.max(1, Date.parse(access.expiresAt) - Date.now()),
        );
      } else if (file.kind === 'IMAGE') {
        await wx.previewImage({ urls: [access.url], current: access.url });
      } else {
        const result = await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>(
          (resolve, reject) => {
            wx.downloadFile({
              url: access.url,
              success: resolve,
              fail: () => {
                reject(new Error('文件下载失败，请重新打开以获取授权'));
              },
            });
          },
        );
        if (!current() || result.statusCode !== 200) {
          wx.getFileSystemManager().unlink({
            filePath: result.tempFilePath,
            fail: () => {
              /* Already reclaimed temporary files require no recovery. */
            },
          });
          if (current()) throw new Error('文件下载失败，请重新获取授权');
          return;
        }
        this._downloads.push(result.tempFilePath);
        await wx.openDocument({
          filePath: result.tempFilePath,
          fileType:
            file.kind === 'PDF'
              ? 'pdf'
              : file.contentType === 'application/msword'
                ? 'doc'
                : 'docx',
          showMenu: false,
        });
      }
    } catch (error) {
      if (current()) this.setData({ feedback: learningTaskError(error), feedbackTone: 'warning' });
    } finally {
      if (current()) this.setData({ openingFile: false });
    }
  },
  videoError() {
    this.closeVideo();
    this.setData({
      feedback: '视频播放失败或授权已过期，请重新打开附件获取授权',
      feedbackTone: 'warning',
    });
  },
  async submit() {
    const d = this.data.detail;
    if (
      !d ||
      this.data.submitting ||
      this.data.loading ||
      this.data.uploading ||
      this.data.selecting
    )
      return;
    const pending = pendingOperation(this._id),
      view = presentation(d);
    if (!pending && (!view.canAct || !this.data.versionReady)) {
      this.setData({
        feedback: '当前不可操作，请刷新任务状态和版本',
        feedbackTone: 'warning',
      });
      return;
    }
    if (
      !pending &&
      this.data.files.some(
        (f) => !f.fileId || (f.unboundExpiresAt && Date.parse(f.unboundExpiresAt) <= Date.now()),
      )
    ) {
      this.setData({ feedback: '附件尚未登记或已到期，请上传或重新选择', feedbackTone: 'warning' });
      return;
    }
    const pure = view.pureConfirmation && !this.data.text.trim() && !this.data.files.length;
    if (!pending) {
      const error = pure
        ? this.data.confirmed
          ? ''
          : '请主动确认已完成学习'
        : validateSubmission(d, this.data.text, this.data.confirmed, this.data.files.length);
      if (error) {
        this.setData({ feedback: error, feedbackTone: 'warning' });
        return;
      }
    }
    const generation = this._generation,
      owner = getCurrentIdentity().id;
    const revision = this._identityRevision;
    const body = pending
      ? pending.body
      : pure
        ? null
        : submissionBody(
            d,
            this.data.text,
            this.data.files.map((f) => resourceId(f.fileId)),
          );
    // Lock before opening modal so repeated taps cannot open concurrent dialogs.
    this.setData({ submitting: true, feedback: '' });
    const accepted = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: pending ? '核实上次操作' : pure ? '确认学习' : '提交学习成果',
        content: pending
          ? '将使用原操作标识和原内容核实结果，不会创建新的重复提交。'
          : '确认提交？最终学习进度以服务端结果为准。',
        success: (r) => {
          if (r.confirm && !pending && d.task.reviewRequired && this._businessSubscription) {
            // The explicit confirmation is the native user gesture; no network precedes consent.
            void this._businessSubscription.request('LEARNING_SUBMIT').then(valid => resolve(valid));
          } else resolve(r.confirm);
        },
        fail: () => {
          resolve(false);
        },
      });
    });
    if (!this._alive || generation !== this._generation || owner !== getCurrentIdentity().id) {
      if (this._alive) this.setData({ submitting: false });
      return;
    }
    if (!accepted) {
      this.setData({ submitting: false });
      return;
    }
    try {
      if (!this.data.detail) throw new Error('请重新读取当前分配');
      await runLearningOperation(this._id, this._etag, body, this.data.detail.assignment.subject);
      if (!this.isSameSession(owner, revision)) return;
      this._uploadAttempts.clear();
      this.setData({
        text: '',
        textCount: 0,
        confirmed: false,
        files: [],
        uploading: false,
        selecting: false,
        openingFile: false,
        feedback: '操作已受理，正在读取最新学习进度',
        feedbackTone: 'success',
        unresolved: false,
      });
    } catch (e) {
      if (!this.isSameSession(owner, revision)) return;
      const unresolved = !!pendingOperation(this._id);
      this.setData({
        unresolved,
        feedback: unresolved
          ? '上次操作结果尚未确认。请核实原操作结果，勿重新提交。'
          : learningTaskError(e),
        feedbackTone: 'warning',
      });
    } finally {
      if (this.isSameSession(owner, revision)) {
        this.setData({ submitting: false });
        this.syncLeaveGuard();
        if (this._visible) await this.load();
      }
    }
  },
});
