// utils/definePage.ts
type BehaviorOption = WechatMiniprogram.Component.BehaviorOption;

type MixinBehaviorData<TBehavior extends BehaviorOption> =
  WechatMiniprogram.Component.MixinData<TBehavior> &
    WechatMiniprogram.Component.MixinProperties<TBehavior>;

type InstanceData<
  TData extends WechatMiniprogram.Page.DataOption,
  TBehavior extends BehaviorOption,
> = WechatMiniprogram.Component.FilterUnknownType<TData> & MixinBehaviorData<TBehavior>;

type ReservedOptionKey = keyof WechatMiniprogram.Page.ILifetime | 'data' | 'behaviors' | 'options';

type CustomInstanceOption<TCustom extends WechatMiniprogram.Page.CustomOption> = Omit<
  TCustom,
  ReservedOptionKey
>;

type InstanceCustom<
  TCustom extends WechatMiniprogram.Page.CustomOption,
  TBehavior extends BehaviorOption,
> = CustomInstanceOption<TCustom> & WechatMiniprogram.Component.MixinMethods<TBehavior>;

type PageWithBehaviorInstance<
  TData extends WechatMiniprogram.Page.DataOption,
  TCustom extends WechatMiniprogram.Page.CustomOption,
  TBehavior extends BehaviorOption,
> = WechatMiniprogram.OptionalInterface<WechatMiniprogram.Page.ILifetime> &
  WechatMiniprogram.Page.InstanceProperties &
  WechatMiniprogram.Page.InstanceMethods<InstanceData<TData, TBehavior>> &
  WechatMiniprogram.Page.Data<InstanceData<TData, TBehavior>> &
  InstanceCustom<TCustom, TBehavior>;

type PageWithBehaviorOptions<
  TData extends WechatMiniprogram.Page.DataOption,
  TCustom extends WechatMiniprogram.Page.CustomOption,
  TBehavior extends BehaviorOption,
> = TCustom &
  Partial<WechatMiniprogram.Page.Data<TData>> &
  Partial<WechatMiniprogram.Page.ILifetime> & {
    options?: WechatMiniprogram.Component.ComponentOptions;
  } & Partial<WechatMiniprogram.Component.Behavior<TBehavior>> &
  ThisType<PageWithBehaviorInstance<TData, TCustom, TBehavior>>;

export default function definePage<
  TData extends WechatMiniprogram.Page.DataOption,
  TCustom extends WechatMiniprogram.Page.CustomOption,
  TBehavior extends BehaviorOption = WechatMiniprogram.Component.IEmptyArray,
>(options: PageWithBehaviorOptions<TData, TCustom, TBehavior>): void {
  Page(options as unknown as WechatMiniprogram.Page.Options<TData, TCustom>);
}
