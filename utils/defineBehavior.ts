// utils/defineBehavior.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
export default function defineBehavior<TCustom extends Record<string, any> = {}>() {
  return <
    TData extends WechatMiniprogram.Behavior.DataOption,
    TProperty extends WechatMiniprogram.Behavior.PropertyOption,
    TMethod extends WechatMiniprogram.Behavior.MethodOption,
    TBehavior extends WechatMiniprogram.Behavior.BehaviorOption,
  >(
    options: WechatMiniprogram.Behavior.Options<TData, TProperty, TMethod, TBehavior, TCustom>,
  ) => Behavior(options);
}
