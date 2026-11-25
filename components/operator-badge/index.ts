import defineComponent from '../../utils/defineComponent';

/** Callers only mount a badge when they have verified display data. */
defineComponent()({
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    kind: { type: String, value: 'operator' },
    mentor: {
      type: Object as unknown as null,
      value: null as { realName: string; position: string; affiliation: string } | null,
    },
    historical: { type: Boolean, value: false },
  },
  data: { opened: false },
  observers: {
    'kind, mentor, historical'() {
      if (this.data.opened) this.setData({ opened: false });
    },
  },
  pageLifetimes: {
    hide() {
      this.setData({ opened: false });
    },
  },
  methods: {
    open() {
      if (this.properties.kind === 'mentor' && !this.properties.mentor) return;
      this.setData({ opened: true });
    },
    close() {
      this.setData({ opened: false });
    },
    noop() {
      // Keep taps inside the dialog and touches on the backdrop from bubbling.
    },
  },
});
