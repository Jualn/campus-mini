import { certificationLabel, hasAnswerAttribution, mentorAnswerAvatar } from '../../../utils/mentor-qa';
import { community } from '../../../services/post-community';
import { deletePostAndSync } from '../../../actions/post';
import { removeComment } from '../../../actions/comment';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import {
  lifecycleLabel,
  commentLabel,
  reportLabel,
  knownSubmission,
} from '../../../utils/post-community';
import { POST_CAPABILITIES } from '../../../config/post-capabilities';
import { getErrorMessage, showErrorToast } from '../../../utils/notify';
import { storage, STORAGE_KEYS } from '../../../utils/storage';
import { formatTime, TimeStyle } from '../../../utils/time-util';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

function detailCopy(kind: string, postType: string, mentorAnswer = false) {
  const qa = postType === 'MENTOR_QA';
  if (kind === 'report') {
    return {
      pageTitle: '举报详情',
      typeLabel: '社区举报',
      contentLabel: '举报补充说明',
    };
  }
  if (kind === 'comment') {
    return {
      pageTitle: mentorAnswer ? '回答详情' : qa ? '讨论详情' : '评论详情',
      typeLabel: qa ? '导师答疑' : postType === 'ALL' ? '社区记录' : '普通社区',
      contentLabel: mentorAnswer ? '回答内容' : '评论内容',
    };
  }
  return {
    pageTitle: qa ? '提问详情' : '帖子详情',
    typeLabel: qa ? '导师答疑' : '普通社区',
    contentLabel: qa ? '问题正文' : '帖子正文',
  };
}

function formatRecordTime(value: string): string {
  if (!value) return '';
  const time = Number.isFinite(Date.parse(value.replace(' ', 'T')))
    ? formatTime(value, TimeStyle.SHORT_YMDHM)
    : value;
  return `提交于 ${time}`;
}

function submissionTone(
  visibility: string,
  safety: string,
  authorDeleted = false,
  adminHidden = false,
): StatusTone {
  if (authorDeleted || adminHidden || safety === 'REJECTED') return 'danger';
  return visibility === 'PUBLIC' && safety === 'PASSED' ? 'success' : 'warning';
}

Page({
  _generation: 0,
  _alive: true,
  _owner: '',
  _off: null as (() => void) | null,
  _returnKind: 'posts',
  data: {
    kind: '',
    id: '',
    postType: 'NORMAL',
    pageTitle: '本人记录',
    typeLabel: '社区记录',
    contentLabel: '提交内容',
    contentTitle: '',
    category: '',
    answerIdentity: '',
    answerAvatar: null as ReturnType<typeof mentorAnswerAvatar> | null,
    certification: '',
    text: '',
    images: [] as string[],
    status: '',
    statusTone: 'neutral',
    timeLabel: '',
    notice: '',
    loading: false,
    error: '',
    deleted: false,
    loaded: false,
    canEdit: false,
    canDelete: false,
    publicPostId: '',
    commentId: '',
    pending: false,
    returnUrl: 'list?kind=posts&postType=NORMAL',
  },
  onLoad(query: { kind?: string; id?: string; fromKind?: string; postType?: string }) {
    const kind = query.kind ?? '';
    const postType =
      query.postType === 'MENTOR_QA' || query.postType === 'ALL' ? query.postType : 'NORMAL';
    const defaultKind = kind === 'comment' ? 'comments' : kind === 'report' ? 'reports' : 'posts';
    this._returnKind =
      query.fromKind &&
      ['posts', 'comments', 'favorites', 'history', 'reports'].includes(query.fromKind)
        ? query.fromKind
        : defaultKind;
    this.setData({
      kind,
      id: query.id ?? '',
      postType,
      ...detailCopy(kind, postType),
      returnUrl: `list?kind=${this._returnKind}&postType=${postType}`,
    });
    void wx.setNavigationBarTitle({ title: this.data.pageTitle });
    this._owner = getCurrentIdentity().id;
    this._off = watchCurrentIdentity(() => {
      if (this._owner === getCurrentIdentity().id) return;
      this._owner = getCurrentIdentity().id;
      ++this._generation;
      this.setData({
        contentTitle: '',
        category: '',
        answerIdentity: '',
        answerAvatar: null,
        certification: '',
        loaded: false,
        text: '',
        images: [],
        status: '',
        statusTone: 'neutral',
        timeLabel: '',
        notice: '',
        canEdit: false,
        canDelete: false,
        publicPostId: '',
        commentId: '',
        loading: false,
        deleted: false,
        error: '账号已变化，请刷新本人记录',
      });
    });
  },
  onShow() {
    void this.load();
  },
  onUnload() {
    this._alive = false;
    ++this._generation;
    this._off?.();
  },
  async load() {
    const generation = ++this._generation,
      owner = getCurrentIdentity().id,
      token = storage.get(STORAGE_KEYS.TOKEN);
    this.setData({ loading: true, error: '', deleted: false, canEdit: false, canDelete: false });
    try {
      if (!owner || !this.data.id) throw new Error('请登录后从本人记录进入');
      let answerIdentity = '',
        certification = '';
      let answerAvatar: ReturnType<typeof mentorAnswerAvatar> | null = null;
      let text = '',
        status = '',
        statusTone: StatusTone = 'neutral',
        timeLabel = '',
        contentTitle = '',
        category = '',
        notice = '',
        postType = this.data.postType,
        mentorAnswer = false,
        images: string[] = [],
        canEdit = false,
        canDelete = false,
        publicPostId = '',
        commentId = '';
      if (this.data.kind === 'post') {
        const value = await community.myPost(this.data.id),
          s = value.submission;
        if (s.id !== this.data.id || !['NORMAL', 'MENTOR_QA'].includes(value.post.postType ?? ''))
          throw new Error('内容类型暂不支持');
        text = value.post.content;
        contentTitle = value.post.title?.trim() ?? '';
        category = value.post.category?.name ?? '';
        postType = value.post.postType ?? 'NORMAL';
        images = value.post.attachments.map((x) => x.url);
        status = lifecycleLabel(s.lifecycle);
        statusTone = submissionTone(
          s.lifecycle.visibility,
          s.lifecycle.safety,
          s.lifecycle.authorDeleted,
          s.lifecycle.adminHidden,
        );
        timeLabel = formatRecordTime(s.lifecycle.acceptedAt);
        notice = s.notice?.message ?? '';
        const known = knownSubmission(s);
        canEdit =
          known &&
          !s.lifecycle.adminHidden &&
          !s.lifecycle.authorDeleted &&
          POST_CAPABILITIES.communityV1 &&
          POST_CAPABILITIES.organization &&
          (value.post.postType === 'NORMAL' || POST_CAPABILITIES.mentorQa) &&
          (s.availableActions.includes('EDIT') || s.availableActions.includes('RESUBMIT'));
        canDelete = known && s.availableActions.includes('DELETE');
        if (
          known &&
          (s.lifecycle.visibility === 'PUBLIC' ||
            (s.lifecycle.visibility === 'TEMPORARY' &&
              Date.parse(s.lifecycle.temporaryVisibleUntil ?? '') > Date.now()))
        )
          publicPostId = s.id;
      } else if (this.data.kind === 'comment') {
        const value = await community.myComment(this.data.id),
          s = value.submission;
        text = value.content;
        mentorAnswer = value.kind === 'MENTOR_ANSWER';
        postType = s.postType ?? (mentorAnswer ? 'MENTOR_QA' : this.data.postType);
        if (mentorAnswer && hasAnswerAttribution(value.mentorAnswer, false)) {
          const a = value.mentorAnswer;
          answerIdentity = `${a.profileAtAnswer.realName} · ${a.profileAtAnswer.position} · ${a.profileAtAnswer.affiliation}`;
          answerAvatar = mentorAnswerAvatar(a);
          certification = certificationLabel(a.currentCertification.state);
        }
        images = value.imageUrl ? [value.imageUrl] : [];
        status = commentLabel(s);
        statusTone = submissionTone(s.visibility, s.safety);
        timeLabel = formatRecordTime(s.acceptedAt);
        if (
          value.kind === 'MENTOR_ANSWER' &&
          !hasAnswerAttribution(value.mentorAnswer) &&
          s.visibility === 'PUBLIC'
        ) {
          status = '正式回答的公开事实暂不可确认';
          statusTone = 'warning';
        }
        notice = s.notice?.message ?? '';
        const known =
          ['PUBLIC', 'PRIVATE'].includes(s.visibility) &&
          ['CHECKING', 'PASSED', 'REJECTED', 'REVIEW_REQUIRED', 'CHECK_FAILED'].includes(s.safety);
        canDelete = known && s.availableActions.includes('DELETE');
        if (known && s.availableActions.includes('VIEW_CONTEXT')) {
          publicPostId = s.postId;
          commentId = s.id;
        }
      } else if (this.data.kind === 'report') {
        const value = await community.report(this.data.id);
        text = value.remark ?? '';
        status = reportLabel(value.outcome);
        statusTone = value.outcome === 'PENDING' ? 'warning' : 'neutral';
        timeLabel = formatRecordTime(value.createdAt);
        notice = value.resultSummary ?? '';
      } else throw new Error('详情类型暂不支持');
      const copy = detailCopy(this.data.kind, postType, mentorAnswer);
      if (
        !this._alive ||
        generation !== this._generation ||
        owner !== getCurrentIdentity().id ||
        token !== storage.get(STORAGE_KEYS.TOKEN)
      )
        return;
      this.setData({
        postType,
        ...copy,
        contentTitle,
        category,
        answerIdentity,
        answerAvatar,
        certification,
        text,
        images,
        status,
        statusTone,
        timeLabel,
        notice,
        canEdit,
        canDelete,
        publicPostId,
        commentId,
        loaded: true,
        returnUrl: `list?kind=${this._returnKind}&postType=${postType}`,
      });
      void wx.setNavigationBarTitle({ title: copy.pageTitle });
    } catch (error) {
      if (this._alive && generation === this._generation)
        this.setData({
          loaded: false,
          contentTitle: '',
          category: '',
          text: '',
          images: [],
          status: '',
          statusTone: 'neutral',
          timeLabel: '',
          error: getErrorMessage(error, '结果查询失败，请重试'),
        });
    } finally {
      if (this._alive && generation === this._generation) this.setData({ loading: false });
    }
  },
  edit() {
    if (!this.data.canEdit) return;
    void wx.navigateTo({
      url: `/subpkg_community/pages/post-edit/post-edit?postId=${encodeURIComponent(this.data.id)}&resubmit=1`,
    });
  },
  openPublic() {
    if (!this.data.publicPostId) return;
    void wx.navigateTo({
      url: `/subpkg_community/pages/detail/detail?postId=${encodeURIComponent(this.data.publicPostId)}${this.data.commentId ? '&commentId=' + encodeURIComponent(this.data.commentId) : ''}`,
    });
  },
  async remove() {
    if (!this.data.canDelete || this.data.pending) return;
    const generation = this._generation;
    this.setData({ pending: true });
    try {
      const confirm = await wx.showModal({
        title: '确认删除？',
        content: '删除后无法恢复。',
        confirmText: '删除',
        confirmColor: '#e02020',
      });
      if (!confirm.confirm || generation !== this._generation) return;
      if (this.data.kind === 'post') await deletePostAndSync(this.data.id);
      else await removeComment(this.data.id);
      if (this._alive && generation === this._generation) {
        this.setData({
          loaded: false,
          text: '',
          images: [],
          canEdit: false,
          canDelete: false,
          deleted: true,
          error: '',
        });
      }
    } catch (error) {
      showErrorToast(error, { fallback: '删除结果未确认，请刷新状态' });
    } finally {
      if (this._alive) this.setData({ pending: false });
    }
  },
  preview(e: WechatMiniprogram.TouchEvent) {
    void wx.previewImage({ urls: this.data.images, current: String(e.currentTarget.dataset.url) });
  },
});
