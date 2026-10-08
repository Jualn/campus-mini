import ts from 'typescript';

const migratedLegacyAssets = [
  '/assets/icons/common/clear.svg',
  '/assets/icons/common/choose_image.svg',
  '/assets/icons/common/send.svg',
  '/images/interact/comment.svg',
  '/images/interact/view.svg',
  '/assets/icons/common/more.svg',
  '/assets/icons/share-popup/preview.svg',
  '/assets/icons/share-popup/download.svg',
  '/assets/icons/detail/location.svg',
  '/assets/icons/detail/participants.svg',
  '/assets/icons/detail/contact.svg',
  '/assets/icons/detail/attachment.svg',
  '/assets/icons/detail/file_item.svg',
  '/assets/icons/detail/link_item.svg',
  '/images/tabbar/home.svg',
  '/images/tabbar/home-active.svg',
  '/images/tabbar/message.svg',
  '/images/tabbar/message-active.svg',
  '/images/tabbar/user.svg',
  '/images/tabbar/user-active.svg',
  '/images/icons/setting.svg',
  '/images/interact/like.svg',
  '/images/interact/like-fill.svg',
];

// 已纳入 Registry 的资源不能再由调用方直接引用；UiIcon 自身负责 image 渲染。
export function findDirectIconAssets(markup, registry) {
  const assets = new Set([
    ...migratedLegacyAssets,
    ...Object.values(registry).flatMap((descriptor) => Object.values(descriptor)),
  ]);
  return [...markup.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<image\b[^>]*>/g)].flatMap(
    ([tag]) => {
      const src = tag.match(/\ssrc\s*=\s*(["'])(.*?)\1/)?.[2];
      return assets.has(src) ? [src] : [];
    },
  );
}

export function findMissingIconAssets(registry, exists) {
  return Object.values(registry).flatMap((descriptor) =>
    Object.values(descriptor).filter((asset) => !exists(asset)),
  );
}

export function readIconSemanticKeys(source) {
  const file = ts.createSourceFile('registry.ts', source, ts.ScriptTarget.Latest, true);
  let keys;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'ICON_REGISTRY') {
      let value = node.initializer;
      while (value && ts.isAsExpression(value)) value = value.expression;
      if (!value || !ts.isObjectLiteralExpression(value)) {
        throw new Error('ICON_REGISTRY 必须是静态对象');
      }
      keys = value.properties.map((property) => {
        if (
          !ts.isPropertyAssignment(property) ||
          !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        ) {
          throw new Error('Registry semantic 必须使用静态名称');
        }
        return property.name.text;
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!keys) throw new Error('缺少 ICON_REGISTRY');
  return keys;
}
