import defineComponent from '../../utils/defineComponent';
import { createLogger } from '../../utils/logger';
import { ENV } from '../../config/index';
import { resolveIcon } from './registry';
import type { IconName } from './registry';

const log = createLogger('UiIcon');
const warned = new Set<string>();

function warnOnce(key: string, message: string) {
  if (ENV !== 'develop' || warned.has(key)) return;
  warned.add(key);
  log.warn(`resolve:${key}`, message);
}

defineComponent()({
  properties: {
    name: {
      type: String,
      value: '' as IconName,
      observer() {
        this._resolve();
      },
    },
    state: {
      type: String,
      value: 'default',
      observer() {
        this._resolve();
      },
    },
    size: {
      type: String,
      value: 'md',
      observer() {
        this._resolve();
      },
    },
  },
  data: {
    src: '',
    resolvedSize: 'md',
  },
  lifetimes: {
    attached() {
      this._resolve();
    },
  },
  methods: {
    _resolve() {
      const { name, state, size } = this.properties;
      const result = resolveIcon(name, state, size);
      if (result.unknownName) warnOnce(`name:${name}`, `Unknown icon semantic "${name}".`);
      if (result.unsupportedState) {
        warnOnce(
          `state:${name}:${state}`,
          `Unsupported state "${state}" for icon "${name}"; using default.`,
        );
      }
      if (result.invalidSize)
        warnOnce(`size:${size}`, `Unsupported icon size "${size}"; using md.`);
      this.setData({ src: result.src, resolvedSize: result.resolvedSize });
    },
  },
});
