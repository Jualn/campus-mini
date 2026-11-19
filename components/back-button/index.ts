import defineComponent from '../../utils/defineComponent';
import { ROUTES } from '../../utils/routes';
import { wxNavigateBack, wxReLaunch } from '../../utils/wx-promise';

defineComponent()({
  options: {
    styleIsolation: 'isolated',
  },

  properties: {
    variant: {
      type: String,
      value: 'nav',
    },
    inverse: {
      type: Boolean,
      value: false,
    },
    autoBack: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    navigating: false,
  },

  methods: {
    onBack() {
      this.triggerEvent('back');
      if (!this.data.autoBack || this.data.navigating) return;

      this.setData({ navigating: true });
      const reset = () => {
        this.setData({ navigating: false });
      };

      if (getCurrentPages().length > 1) {
        void wxNavigateBack({ fail: reset });
        return;
      }

      void wxReLaunch({ url: ROUTES.HOME, fail: reset });
    },
  },
});
