import {
  pendingGrowthCreation,
  retainGrowthCreation,
  runGrowthCreation,
  type GrowthCreation,
} from '../../services/growth-creation';
import { createLeaveGuard } from '../../../utils/leave-guard';
import definePage from '../../../utils/definePage';
import { isHttpError } from '../../../utils/error';
import { getCurrentIdentity, watchCurrentAccount } from '../../../actions/current-user';
import {
  getMyPersonBinding,
  watchPersonBinding,
  assertCurrentPerson,
  requireCurrentPerson,
} from '../../../services/person-binding';
import { selectImages } from '../../../actions/media';
import { chooseMessageFile, wxShowModal } from '../../../utils/wx-promise';
import {
  publishingContext,
  getGrowth,
  editableGrowth,
  editGrowth,
  resourceId,
  readRecordType,
  growthRoute,
  growthError,
  type PublishContext,
  type GrowthCreate,
  type GrowthWrite,
} from '../../services/growth-record';
import {
  selectedGrowthFile,
  uploadGrowthFile,
  type GrowthFile,
  type UploadAttempt,
} from '../../services/growth-media';
interface LocalFile {
  file: GrowthFile;
  attempt: UploadAttempt;
}
definePage({
  data: {
    editing: false,
    loading: false,
    busy: false,
    selecting: false,
    error: '',
    feedback: '',
    title: '',
    content: '',
    context: null as PublishContext | null,
    organizationIndex: -1,
    organizationNames: [] as string[],
    typeIndex: -1,
    typeNames: [] as string[],
    files: [] as { name: string; path: string; mediaId: string; key: number; kind: 'IMAGE' | 'VIDEO' }[],
    existingMediaIds: [] as string[],
    progress: 0,
    ready: false,
    unresolved: false,
    remoteContent: '',
    remoteTitle: '',
    remoteMediaCount: 0,
    remoteVersionLoaded: false,
    needsVersion: false,
    saved: false,
    savedPostId: '',
  },
  _leaveGuard: null as ReturnType<typeof createLeaveGuard> | null,
  _valid: true,
  _id: '',
  _etag: '',
  _personId: '',
  _organizationId: '',
  _recordType: readRecordType('GROWTH'),
  _files: [] as LocalFile[],
  _generation: 0,
  _visible: false,
  _initialized: false,
  _pending: null as { payload: GrowthCreate; key: string } | GrowthCreation | null,
  _off: null as (() => void) | null,
  _offBinding: null as (() => void) | null,
  onLoad(query: { postId?: string; recordType?: string }) {
    this._leaveGuard = createLeaveGuard();
    this._files = [];
    try {
      if (!query.postId && query.recordType) this._recordType = readRecordType(query.recordType);
      if (query.postId) {
        this._id = resourceId(query.postId);
        this.setData({ editing: true });
      }
    } catch (e) {
      this._valid = false;
      this.setData({ error: growthError(e) });
    }
    this._off = watchCurrentAccount(() => {
      this.invalidate();
    });
    this._offBinding = watchPersonBinding(() => {
      this.invalidate();
    });
  },
  invalidate() {
    this._leaveGuard?.(false);
    ++this._generation;
    this._files = [];
    this._pending = null;
    this._etag = '';
    this._personId = '';
    this._initialized = false;
    this.setData({
      title: '',
      content: '',
      files: [],
      existingMediaIds: [],
      ready: false,
      unresolved: false,
      busy: false,
      selecting: false,
      context: null,
      organizationIndex: -1,
      typeIndex: -1,
      feedback: '身份已变化，请重新读取发布选项',
      needsVersion: false,
      remoteContent: '',
      remoteTitle: '',
      remoteMediaCount: 0,
      remoteVersionLoaded: false,
      saved: false,
      savedPostId: '',
    });
    if (this._visible) void this.load();
  },
  onShow() {
    this._leaveGuard?.resume();
    this._visible = true;
    void this.load();
  },
  onHide() {
    this._visible = false;
  },
  onUnload() {
    this._visible = false;
    ++this._generation;
    this._off?.();
    this._offBinding?.();
  },
  refresh() {
    void this.load();
  },
  isCurrent(generation: number) {
    return this._visible && generation === this._generation;
  },
  async load() {
    if (!this._valid || !this._visible || this.data.busy || this.data.selecting) return;
    const generation = ++this._generation;
    this.setData({ loading: true, error: '', ready: false });
    try {
      const observedBinding = await getMyPersonBinding();
      if (generation !== this._generation) return;
      const context = await publishingContext();
      if (!this.isCurrent(generation)) return;
      this.setData({ context, organizationNames: context.organizations.map((o) => o.name) });
      this._personId = context.personId ?? '';
      const pending = !this._id ? pendingGrowthCreation() : null;
      if (
        pending &&
        observedBinding.state === 'BOUND' &&
        pending.personId === observedBinding.personId &&
        pending.bindingId === observedBinding.bindingId
      ) {
        this._pending = pending;
        this._personId = pending.personId;
        this._organizationId = pending.payload.organizationId;
        this._recordType = pending.payload.recordType;
        this.setData({
          title: pending.payload.title ?? '',
          content: pending.payload.content,
          existingMediaIds: pending.payload.mediaIds,
          unresolved: true,
          feedback: '上次创建尚未确认，请使用原请求恢复',
          organizationNames: ['原请求发布组织'],
          organizationIndex: 0,
          typeIndex: 0,
          typeNames: [pending.payload.recordType === 'GROWTH' ? '成长记录' : '政治生日'],
          ready: true,
        });
        return;
      }
      if (this._id) {
        const record = await getGrowth(this._id);
        if (generation !== this._generation) return;
        if (!record.availableActions.includes('EDIT'))
          throw new Error('当前仅可读取历史，没有编辑权限');
        const { post, etag } = await editableGrowth(this._id);
        if (generation !== this._generation) return;
        if (post.personId !== this._personId) throw new Error('当前人员与记录归属不匹配');
        this._organizationId = post.organizationId;
        this._recordType = post.recordType;
        if (!this._initialized) {
          this._etag = etag;
          this._initialized = true;
          this.setData({
            title: post.title ?? '',
            content: post.content,
            existingMediaIds: post.mediaIds,
          });
        }
        const o = context.organizations.find(
          (o) =>
            o.organizationId === post.organizationId &&
            o.allowedRecordTypes.includes(post.recordType),
        );
        if (!o) throw new Error('原组织或记录类型当前不可发布');
        this.setData({
          organizationIndex: context.organizations.indexOf(o),
          typeNames: [post.recordType === 'GROWTH' ? '成长记录' : '政治生日'],
          typeIndex: 0,
          ready: true,
        });
      } else {
        let selected = context.organizations.findIndex(
          (o) => o.organizationId === this._organizationId,
        );
        if (selected < 0 && !this._organizationId && context.organizations.length === 1) {
          this._organizationId = context.organizations[0].organizationId;
          selected = 0;
        }
        const o = selected >= 0 ? context.organizations[selected] : null;
        if (
          o &&
          !o.allowedRecordTypes.includes(this._recordType) &&
          o.allowedRecordTypes.length === 1 &&
          !this._files.length &&
          !this._pending
        )
          this._recordType = o.allowedRecordTypes[0];
        if (!o?.allowedRecordTypes.includes(this._recordType)) {
          if (this._files.length || this._pending)
            throw new Error('发布资格已变化，请移除旧媒体并重新选择');
          this._organizationId = '';
          this.setData({ organizationIndex: -1, typeIndex: -1, typeNames: [] });
        } else
          this.setData({
            organizationIndex: selected,
            typeNames: o.allowedRecordTypes.map((t) => (t === 'GROWTH' ? '成长记录' : '政治生日')),
            typeIndex: o.allowedRecordTypes.indexOf(this._recordType),
          });
        this.setData({
          ready:
            !!context.personId &&
            context.organizations.some((o) => o.allowedRecordTypes.length > 0),
        });
        if (!this.data.ready)
          this.setData({ feedback: '当前没有可用发布选项；历史记录仍可从成长档案读取' });
      }
    } catch (e) {
      if (generation === this._generation) this.setData({ error: growthError(e), ready: false });
    } finally {
      if (generation === this._generation) this.setData({ loading: false });
    }
  },
  changeOrganization(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (
      this.data.editing ||
      this.data.busy ||
      this.data.unresolved ||
      this.data.selecting ||
      this._files.length
    )
      return;
    const index = Number(e.detail.value),
      o = this.data.context?.organizations[index];
    if (!o) return;
    this._organizationId = o.organizationId;
    const preferredType = o.allowedRecordTypes.indexOf(this._recordType);
    const typeIndex = preferredType >= 0 ? preferredType : o.allowedRecordTypes.length === 1 ? 0 : -1;
    if (typeIndex >= 0) this._recordType = o.allowedRecordTypes[typeIndex];
    this.setData({
      organizationIndex: index,
      typeIndex,
      typeNames: o.allowedRecordTypes.map((t) => (t === 'GROWTH' ? '成长记录' : '政治生日')),
    });
  },
  changeType(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (
      this.data.editing ||
      this.data.busy ||
      this.data.unresolved ||
      this.data.selecting ||
      this._files.length
    )
      return;
    const index = Number(e.detail.value),
      o = this.data.context?.organizations[this.data.organizationIndex],
      t = o?.allowedRecordTypes[index];
    if (t) {
      this._recordType = t;
      this.setData({ typeIndex: index });
    }
  },
  inputTitle(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (!this.data.busy && !this.data.unresolved) {
      this.setData({ title: e.detail.value });
      this._leaveGuard?.(true);
    }
  },
  inputContent(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (!this.data.busy && !this.data.unresolved) {
      this.setData({ content: e.detail.value });
      this._leaveGuard?.(true);
    }
  },
  async select(e: WechatMiniprogram.TouchEvent) {
    if (!this.data.ready || this.data.busy || this.data.unresolved || this.data.selecting) return;
    if (this.data.organizationIndex < 0 || this.data.typeIndex < 0) {
      this.setData({ feedback: '请先选择发布组织和记录类型' });
      return;
    }
    const count = 9 - this._files.length - this.data.existingMediaIds.length;
    if (count <= 0) {
      this.setData({ feedback: '最多选择9项媒体' });
      return;
    }
    const generation = this._generation;
    this.setData({ selecting: true, feedback: '' });
    try {
      let files: GrowthFile[];
      if (e.currentTarget.dataset.kind === 'IMAGE')
        files = (await selectImages(count)).map((f) =>
          selectedGrowthFile(f.filePath, f.originalName, f.fileSize ?? 0, 'IMAGE'),
        );
      else
        files = (await chooseMessageFile({ count, type: 'file', extension: ['mp4'] })).map((f) =>
          selectedGrowthFile(f.path, f.name, f.size ?? 0, 'VIDEO'),
        );
      if (generation !== this._generation) return;
      if (files.length > count) throw new Error('最多选择9项媒体');
      this._files.push(...files.map((file) => ({ file, attempt: { uploaded: false } })));
      this.renderFiles();
      if (files.length) this._leaveGuard?.(true);
    } catch (e) {
      if (generation === this._generation) this.setData({ feedback: growthError(e) });
    } finally {
      if (generation === this._generation) this.setData({ selecting: false });
    }
  },
  renderFiles() {
    this.setData({
      files: this._files.map((f, key) => ({
        key,
        name: f.file.name,
        path: f.file.path,
        kind: f.file.kind,
        mediaId: f.attempt.media?.mediaId ?? '',
      })),
    });
  },
  previewLocal(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.unresolved) return;
    const index = Number(e.currentTarget.dataset.index);
    const current = this._files[index]?.file;
    if (!current || current.kind !== 'IMAGE') return;
    const urls = this._files.filter((item) => item.file.kind === 'IMAGE').map((item) => item.file.path);
    void wx.previewImage({ current: current.path, urls });
  },
  removeFile(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.unresolved) return;
    this._files.splice(Number(e.currentTarget.dataset.index), 1);
    this.renderFiles();
  },
  removeExisting(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.unresolved) return;
    this.setData({
      existingMediaIds: this.data.existingMediaIds.filter(
        (id) => id !== e.currentTarget.dataset.id,
      ),
    });
    this._leaveGuard?.(true);
  },
  async reloadVersion() {
    if (!this._id || this.data.busy) return;
    const generation = this._generation;
    try {
      const { post, etag } = await editableGrowth(this._id);
      if (!this.isCurrent(generation)) return;
      this.setData({
        remoteContent: post.content,
        remoteTitle: post.title ?? '',
        remoteMediaCount: post.mediaIds.length,
        remoteVersionLoaded: true,
      });
      const result = await wxShowModal({
        title: '使用最新版本继续编辑？',
        content:
          '已在表单下方显示当前服务端正文。确认后将保留你的草稿与媒体选择，下一次提交会替换当前正文和媒体集合。',
        confirmText: '保留草稿',
        cancelText: '取消',
      });
      if (!this.isCurrent(generation) || !result.confirm) return;
      this._etag = etag;
      this.setData({
        needsVersion: false,
        unresolved: false,
        feedback: '已读取最新版本，请核对草稿和媒体后提交',
      });
    } catch (e) {
      if (generation === this._generation) this.setData({ feedback: growthError(e) });
    }
  },
  async submit() {
    if (
      (!this.data.ready && !this._pending) ||
      this.data.busy ||
      this.data.selecting ||
      this.data.needsVersion ||
      this.data.saved
    )
      return;
    if (!this._pending && (this.data.organizationIndex < 0 || this.data.typeIndex < 0)) {
      this.setData({ feedback: '请选择发布组织与类型' });
      return;
    }
    if (
      this.data.title.length > 128 ||
      this.data.content.length > 5000 ||
      (!this.data.content.trim() && !this._files.length && !this.data.existingMediaIds.length)
    ) {
      this.setData({ feedback: '请输入正文或选择媒体；标题最多128字，正文最多5000字' });
      return;
    }
    const generation = this._generation,
      owner = getCurrentIdentity().id;
    const current = () => {
      if (generation !== this._generation || owner !== getCurrentIdentity().id)
        throw new Error('身份已变化，请重新读取');
    };
    let writeStarted = false;
    this.setData({ busy: true, feedback: '', progress: 0 });
    try {
      const binding = await requireCurrentPerson();
      current();
      if (binding.personId !== this._personId) throw new Error('人员绑定已变化，请重新读取');
      if (!this._pending || this._id) {
        const context = await publishingContext();
        current();
        if (
          context.personId !== this._personId ||
          !context.organizations.some(
            (o) =>
              o.organizationId === this._organizationId &&
              o.allowedRecordTypes.includes(this._recordType),
          )
        )
          throw new Error('当前发布资格已变化，请刷新');
      }
      if (this._id) {
        const r = await getGrowth(this._id);
        current();
        if (!r.availableActions.includes('EDIT')) throw new Error('当前没有编辑权限');
      }
      if (!this._pending) {
        const mediaIds = [...this.data.existingMediaIds];
        for (const f of this._files) {
          await assertCurrentPerson(binding);
          current();
          const m = await uploadGrowthFile(
            {
              organizationId: this._organizationId,
              recordType: this._recordType,
              ...(this._id ? { postId: this._id } : {}),
            },
            f.file,
            f.attempt,
            current,
            (p) => {
              if (generation === this._generation) this.setData({ progress: p });
            },
          );
          current();
          mediaIds.push(m.mediaId);
          this.renderFiles();
        }
        await assertCurrentPerson(binding);
        current();
        const payload: GrowthCreate = {
          organizationId: this._organizationId,
          recordType: this._recordType,
          title: this.data.title || null,
          content: this.data.content,
          mediaIds,
        };
        this._pending = this._id ? { payload, key: '' } : retainGrowthCreation(payload, binding);
      }
      writeStarted = true;
      const { payload } = this._pending;
      let postId = this._id;
      if (this._id) {
        const edit: GrowthWrite = {
          title: payload.title,
          content: payload.content,
          mediaIds: payload.mediaIds,
        };
        const saved = await editGrowth(this._id, edit, this._etag);
        current();
        this._etag = saved.etag;
      } else {
        const operation = pendingGrowthCreation();
        if (!operation) throw new Error('恢复请求已失效，请重新读取');
        const saved = await runGrowthCreation(operation);
        current();
        postId = saved.link.postId;
      }
      this._pending = null;
      this._leaveGuard?.(false);
      this.setData({
        saved: true,
        savedPostId: postId,
        unresolved: false,
        feedback: '已受理；组织内可见状态以检查结果为准',
      });
      if (this._visible) void wx.redirectTo({ url: growthRoute(postId) });
    } catch (e) {
      if (generation === this._generation) {
        const rejected =
          isHttpError(e) && [400, 401, 403, 404, 412, 422, 428].includes(e.statusCode);
        const uncertain = writeStarted && !rejected;
        this.setData({
          feedback: uncertain ? '提交未确认，请保留草稿。' + growthError(e) : growthError(e),
          unresolved: uncertain,
          needsVersion:
            writeStarted && !!this._id && (uncertain || (isHttpError(e) && e.statusCode === 412)),
        });
        if (this._id || rejected) this._pending = null;
      }
    } finally {
      if (generation === this._generation) this.setData({ busy: false });
    }
  },
});
