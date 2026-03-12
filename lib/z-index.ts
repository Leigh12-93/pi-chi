/** Centralized z-index scale — prevents stacking conflicts across components */
export const Z = {
  /** Base content layer */
  BASE: 0,
  /** File tree, sidebar panels */
  SIDEBAR: 30,
  /** Popover menus, model picker */
  POPOVER: 35,
  /** Overlays behind modals, mobile sidebar backdrop */
  OVERLAY: 40,
  /** Modal dialogs, command palette */
  MODAL: 50,
  /** Tooltips, floating labels */
  TOOLTIP: 60,
  /** Toast notifications */
  NOTIFICATION: 70,
  /** Drag overlay (highest interactive layer) */
  DRAG: 90,
} as const
