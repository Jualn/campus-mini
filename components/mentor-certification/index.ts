import defineComponent from '../../utils/defineComponent';
import { watchCurrentIdentity } from '../../actions/current-user';
import { HttpError } from '../../utils/error';
import { watchPersonBinding } from '../../services/person-binding';
import {
  getCertifiedMentorProfile,
  type CertifiedMentorProfile,
} from '../../services/mentor-certification';

interface Private {
  _generation: number;
  _timer: number | null;
  _off: (() => void) | null;
  _offBinding: (() => void) | null;
  _active: boolean;
  _expiresAt: number | null;
}
defineComponent<Private>()({
  properties: {
    compact: {
      type: Boolean,
      value: false,
    },
    refreshRevision: {
      type: Number,
      value: 0,
      observer() {
        if (this._active) void this.refresh();
      },
    },
    userId: {
      type: String,
      value: '',
      observer() {
        if (this._active) void this.refresh();
      },
    },
  },
  data: { profile: null as CertifiedMentorProfile | null, state: 'loading' },
  lifetimes: {
    attached() {
      this._generation = 0;
      this._timer = null;
      this._expiresAt = null;
      this._active = true;
      this._offBinding = watchPersonBinding(() => {
        this.invalidate();
        if (this._active) void this.refresh();
      });
      this._off = watchCurrentIdentity(() => {
        if (this._active) void this.refresh();
        else this.invalidate();
      });
      void this.refresh();
    },
    detached() {
      this._active = false;
      this.invalidate();
      this._off?.();
      this._offBinding?.();
    },
  },
  pageLifetimes: {
    show() {
      this._active = true;
      void this.refresh();
    },
    hide() {
      this._active = false;
      this.invalidate();
    },
  },
  methods: {
    invalidate() {
      this._generation += 1;
      if (this._timer !== null) clearTimeout(this._timer);
      this._timer = null;
      this._expiresAt = null;
      this.setData({ profile: null, state: 'loading' });
    },
    async refresh() {
      this.invalidate();
      const generation = this._generation,
        userId = this.properties.userId;
      if (!userId) {
        this.setData({ state: 'unavailable' });
        return;
      }
      try {
        const started = Date.now();
        const profile = await getCertifiedMentorProfile(userId);
        if (generation !== this._generation || !this._active) return;
        // Bound expiry by server-evaluated remaining time as well as local time.
        this._expiresAt = profile.validUntil
          ? Math.min(
              Date.parse(profile.validUntil),
              started + Date.parse(profile.validUntil) - Date.parse(profile.evaluatedAt),
            )
          : null;
        if (this._expiresAt !== null && this._expiresAt <= Date.now()) {
          this.setData({ profile: null, state: 'expired' });
          return;
        }
        this.setData({ profile, state: 'valid' });
        this.scheduleExpiry();
      } catch (error) {
        if (generation !== this._generation || !this._active) return;
        this.setData({
          profile: null,
          state:
            error instanceof HttpError && error.statusCode === 404 ? 'inactive' : 'unavailable',
        });
      }
    },
    scheduleExpiry() {
      if (this._expiresAt === null) return;
      const delay = this._expiresAt - Date.now();
      if (delay <= 0) {
        this.setData({ profile: null, state: 'expired' });
        void this.refresh();
        return;
      }
      // Long expiries must not overflow the native timer's signed 32-bit delay.
      this._timer = setTimeout(
        () => {
          this._timer = null;
          this.scheduleExpiry();
        },
        Math.min(delay, 2147483647),
      );
    },
  },
});
