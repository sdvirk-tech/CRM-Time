/** Публичный акцент виджета — палитра продукта. */
export const WIDGET_ACCENT = "#99CCFF";

export function widgetBrand(title: string) {
  return { workspaceTitle: title, accentColor: WIDGET_ACCENT };
}
