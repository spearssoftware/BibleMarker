/**
 * Modal Z-Index Constants
 * 
 * Centralized z-index scale for modals and overlays to ensure proper stacking order.
 * 
 * Z-Index Scale:
 * - 30-39: Overlays and tooltips
 * - 40-49: Backdrops and base modals
 * - 50-59: Important modals and dropdowns
 * - 60+: Critical modals (confirmations, etc.)
 */

export const Z_INDEX = {
  /** Backdrop for modals */
  BACKDROP: 40,
  /** Toolbar overlays (below navbar) */
  TOOLBAR_OVERLAY: 45,
  /** Standard modals and dropdowns */
  MODAL: 50,
  /** Important modals (settings, etc.) */
  MODAL_IMPORTANT: 55,
  /** Critical modals (confirmations) */
  MODAL_CRITICAL: 60,
} as const;
