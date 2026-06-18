// utils/definePage.ts
export default function definePage<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TBehaviorMixin extends Record<string, any> = Record<string, any>,
>() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <TData extends WechatMiniprogram.Page.DataOption, TCustom extends Record<string, any>>(
    options: WechatMiniprogram.Page.Options<
      TData,
      TCustom & TBehaviorMixin // 页面自身推导 & behavior 注入，两个都保留
    > & {
      behaviors?: string[];
    },
  ) => Page(options);
}
