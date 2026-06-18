// utils/defineComponent.ts
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
export default function defineComponent<TCustom extends Record<string, any> = {}>() {
  return <
    TData extends WechatMiniprogram.Component.DataOption,
    TProperty extends WechatMiniprogram.Component.PropertyOption,
    TMethod extends WechatMiniprogram.Component.MethodOption,
    TBehavior extends WechatMiniprogram.Component.BehaviorOption,
  >(
    options: WechatMiniprogram.Component.Options<TData, TProperty, TMethod, TBehavior, TCustom>,
  ) => Component(options);
}
