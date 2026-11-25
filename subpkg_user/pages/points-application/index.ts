import { isReadAccessError } from '../../../utils/error';
import definePage from '../../../utils/definePage';
import { watchPersonBinding } from '../../../services/person-binding';
import { wxDownloadFile, wxPreviewImage, wxShowModal } from '../../../utils/wx-promise';
import {
  getMyPointApplication,
  getMyPointFile,
  getMyPointFileAccess,
  pointId,
  pointsErrorMessage,
  type PointApplication,
  type PointFile,
} from '../../services/points';
import {
  pointApplicationView,
  pointMaterialView,
  pointStatusTone,
  pointTimeText,
} from '../../services/points-state';
import { pointCloseOperation } from '../../services/points-operation';

interface Material {
  fileType?: 'pdf' | 'doc' | 'docx';
  fileId: string;
  name: string;
  kind: PointFile['kind'];
  kindLabel: string;
  previewLabel: string;
  available: boolean;
  error: string;
}
type DetailView = PointApplication & {
  createdAtText: string;
  reviewedAtText: string;
  closedAtText: string;
};

function detailView(detail: PointApplication): DetailView {
  return {
    ...detail,
    createdAtText: pointTimeText(detail.createdAt),
    reviewedAtText: pointTimeText(detail.reviewedAt),
    closedAtText: pointTimeText(detail.closedAt),
  };
}

function statusPresentation(detail: PointApplication) {
  return {
    statusHint:
      detail.status === 'PENDING'
        ? '申请已提交，当前尚未计入积分'
        : detail.status === 'APPROVED'
          ? detail.accounting.status === 'REVOKED'
            ? '原审核已通过，当前有效核发已撤销'
            : '审核已通过，可查看积分入账与后续变动'
          : detail.status === 'REJECTED'
            ? '本次申请未通过审核，可查看审核说明'
            : '你已结束本次申请，历史与材料仍保留',
    statusMark:
      detail.status === 'PENDING'
        ? '…'
        : detail.status === 'APPROVED'
          ? '✓'
          : detail.status === 'REJECTED'
            ? '×'
            : '−',
  };
}

function removeTemporary(filePath: string) {
  if (filePath)
    wx.getFileSystemManager().unlink({
      filePath,
      fail() {
        /* Already removed or unavailable; never log a private path. */
      },
    });
}
definePage({
  _id: '',
  _generation: 0,
  _visible: false,
  _previewing: false,
  _temporary: '',
  _closeOperation: null as ReturnType<typeof pointCloseOperation> | null,
  _closing: false,
  _off: null as (() => void) | null,
  data: {
    loading: true,
    error: '',
    detail: null as DetailView | null,
    statusLabel: '',
    statusTone: 'warning',
    statusHint: '',
    statusMark: '…',
    materials: [] as Material[],
    materialsLoading: false,
    opening: false,
    openingId: '',
    feedback: '',
    canClose: false,
    closeReason: '',
    closeReasonLength: 0,
    closing: false,
    closeUnknown: false,
    closeFeedback: '',
    ledgerUrl: '',
  },
  onLoad(query: Record<string, string | undefined>) {
    try {
      this._id = pointId(query.applicationId);
    } catch {
      this.setData({ loading: false, error: '申请标识无效，请从我的申请重新进入' });
    }
    this._off = watchPersonBinding(() => {
      ++this._generation;
      this._closeOperation = null;
      this._closing = false;
      this.clearTemporary();
      this._previewing = false;
      this.setData({
        detail: null,
        materials: [],
        opening: false,
        openingId: '',
        feedback: '',
        loading: false,
        canClose: false,
        closeReason: '',
        closeReasonLength: 0,
        closing: false,
        closeUnknown: false,
        closeFeedback: '',
      });
      if (this._visible) void this.refresh();
    });
  },
  onShow() {
    this._visible = true;
    this.setData({ closing: this._closing, closeUnknown: !!this._closeOperation });
    this._previewing = false;
    this.clearTemporary();
    void this.refresh();
  },
  onHide() {
    this._visible = false;
    if (this._previewing) return; // Native viewer temporarily hides the Page; clean its file on return.
    ++this._generation;
    this.clearTemporary();
    this.setData({ detail: null, materials: [], opening: false, openingId: '', loading: false });
  },
  onUnload() {
    this._visible = false;
    this._previewing = false;
    ++this._generation;
    this._closeOperation = null;
    this.clearTemporary();
    this._off?.();
  },
  current(generation: number) {
    return (this._visible ? true : this._previewing) && generation === this._generation;
  },
  clearTemporary() {
    removeTemporary(this._temporary);
    this._temporary = '';
  },
  async onPullDownRefresh() {
    try {
      await this.refresh();
    } finally {
      void wx.stopPullDownRefresh();
    }
  },
  async refresh() {
    if (!this._id || this._closing) return;
    const generation = ++this._generation;
    this.setData({
      loading: !this.data.detail,
      canClose: false,
      materials: [],
      error: '',
      feedback: '',
      opening: false,
      openingId: '',
      materialsLoading: false,
    });
    try {
      const detail = await getMyPointApplication(this._id);
      if (!this.current(generation)) return;
      this.setData({
        detail: detailView(detail),
        statusLabel: pointApplicationView(detail).statusLabel,
        statusTone: pointStatusTone(detail.status),
        ...statusPresentation(detail),
        canClose: pointApplicationView(detail).canClose,
        ledgerUrl: `/subpkg_user/pages/person-points/index?applicationId=${encodeURIComponent(detail.applicationId)}`,
        loading: false,
        materialsLoading: true,
      });
      if (detail.status !== 'PENDING') {
        if (this._closeOperation)
          this.setData({
            closeUnknown: false,
            closeFeedback:
              detail.status === 'CLOSED'
                ? '服务端状态：申请已结束'
                : '申请已由管理员审核，未结束申请；以当前审核结果为准',
          });
        this._closeOperation = null;
      }
      const materials = await Promise.all(
        detail.fileIds.map(async (fileId, index): Promise<Material> => {
          try {
            const file = await getMyPointFile(fileId);
            if (file.applicationId !== detail.applicationId) throw new Error('材料关联不可确认');
            return {
              fileId,
              name: file.fileName,
              kind: file.kind,
              ...pointMaterialView(file.kind),
              available: true,
              error: '',
              ...(file.kind === 'IMAGE' || file.kind === 'VIDEO'
                ? {}
                : {
                    fileType:
                      file.kind === 'PDF'
                        ? 'pdf'
                        : file.contentType === 'application/msword'
                          ? 'doc'
                          : 'docx',
                  }),
            };
          } catch {
            return {
              fileId,
              name: `证明材料 ${String(index + 1)}`,
              kind: 'PDF',
              ...pointMaterialView('PDF'),
              available: false,
              error: '材料不存在、无权访问或暂不可用',
            };
          }
        }),
      );
      if (this.current(generation)) this.setData({ materials });
    } catch (error) {
      if (this.current(generation))
        this.setData({
          error: pointsErrorMessage(error),
          ...(isReadAccessError(error) ? { detail: null, materials: [] } : {}),
        });
    } finally {
      if (this.current(generation)) this.setData({ loading: false, materialsLoading: false });
    }
  },
  inputCloseReason(e: WechatMiniprogram.Input) {
    if (!this._closeOperation && !this._closing)
      this.setData({
        closeReason: e.detail.value,
        closeReasonLength: Array.from(e.detail.value).length,
      });
  },
  async closeApplication() {
    if (
      this._closing ||
      this.data.loading ||
      this.data.opening ||
      !this._visible ||
      !this.data.canClose
    )
      return;
    const generation = this._generation;
    let operation = this._closeOperation;
    if (!operation) {
      const reason = this.data.closeReason.trim();
      if (!reason || Array.from(reason).length > 2000) {
        this.setData({ closeFeedback: '请填写结束理由（1～2000字）' });
        return;
      }
    }
    this._closing = true;
    this.setData({ closing: true, closeFeedback: '' });
    try {
      if (!operation) {
        const decision = await wxShowModal({
          title: '结束本次申请？',
          content:
            '结束后不能继续审核或重新打开，历史与材料会保留。若管理员先完成审核，将以审核结果为准。',
          confirmText: '确认结束',
          cancelText: '继续等待',
          confirmColor: '#C43B4A',
        });
        if (!decision.confirm || !this.current(generation)) return;
        operation = pointCloseOperation(this._id, { reason: this.data.closeReason.trim() });
        this._closeOperation = operation;
      }
      const detail = await operation.submit();
      if (this._closeOperation !== operation || !this.current(generation)) return;
      this.setData({
        detail: detailView(detail),
        statusLabel: pointApplicationView(detail).statusLabel,
        statusTone: pointStatusTone(detail.status),
        ...statusPresentation(detail),
        canClose: pointApplicationView(detail).canClose,
        closeUnknown: false,
        closeFeedback:
          detail.status === 'CLOSED'
            ? '服务端状态：申请已结束'
            : '申请已由管理员审核，未结束申请；以当前审核结果为准',
      });
      this._closeOperation = null;
    } catch (error) {
      if (!operation) {
        if (this.current(generation)) this.setData({ closeFeedback: pointsErrorMessage(error) });
        return;
      }
      if (this._closeOperation !== operation || !this.current(generation)) return;
      const unknown = operation.state === 'UNKNOWN';
      this.setData({
        closeUnknown: unknown,
        closeFeedback: unknown
          ? '结束结果尚未确认，请使用原操作查询恢复；结束理由已锁定'
          : pointsErrorMessage(error),
      });
      if (!unknown) this._closeOperation = null;
    } finally {
      if (!operation || this._closeOperation === operation || generation === this._generation) {
        this._closing = false;
        if (this.current(this._generation)) {
          this.setData({ closing: false });
          if (operation && generation !== this._generation) void this.refresh();
        }
      }
    }
  },
  async preview(e: WechatMiniprogram.TouchEvent) {
    if (this.data.opening || this.data.loading || this._closing || !this._visible) return;
    const material = this.data.materials.find(
      (item) => item.fileId === e.currentTarget.dataset.id && item.available,
    );
    if (!material) return;
    const generation = this._generation;
    this.setData({ opening: true, openingId: material.fileId, feedback: '' });
    try {
      const access = await getMyPointFileAccess(material.fileId);
      if (!this.current(generation)) return;
      if (Date.parse(access.expiresAt) <= Date.now()) throw new Error('材料访问已过期');
      // Use the signed capability alone. The normal API download helper would attach a bearer and base URL.
      const downloaded = await wxDownloadFile({
        url: access.url,
        header: { 'Cache-Control': 'no-store' },
        timeout: 30000,
      });
      if (!this.current(generation)) {
        removeTemporary(downloaded.tempFilePath);
        return;
      }
      this._temporary = downloaded.tempFilePath;
      if (downloaded.statusCode !== 200) throw new Error('材料下载未成功');
      this._previewing = true;
      if (material.kind === 'IMAGE')
        await wxPreviewImage({
          urls: [this._temporary],
          current: this._temporary,
          ...(wx.canIUse('previewImage.object.showmenu') ? { showmenu: false } : {}),
        });
      else if (material.kind === 'VIDEO')
        await new Promise<void>((resolve, reject) => {
          if (!wx.canIUse('previewMedia')) {
            reject(new Error('当前微信版本不支持视频预览'));
            return;
          }
          wx.previewMedia({
            sources: [{ url: this._temporary, type: 'video' }],
            ...(wx.canIUse('previewMedia.object.showmenu') ? { showmenu: false } : {}),
            success: () => {
              resolve();
            },
            fail: () => {
              reject(new Error('暂时无法播放材料'));
            },
          });
        });
      else
        await new Promise<void>((resolve, reject) => {
          wx.openDocument({
            filePath: this._temporary,
            fileType: material.fileType,
            showMenu: false,
            success: () => {
              resolve();
            },
            fail: () => {
              reject(new Error('暂时无法打开材料'));
            },
          });
        });
    } catch {
      this._previewing = false;
      this.clearTemporary();
      if (this.current(generation))
        this.setData({ feedback: '材料暂时无法查看，请重新查询后再试；不会改用公开链接' });
    } finally {
      if (this.current(generation)) this.setData({ opening: false, openingId: '' });
    }
  },
});
