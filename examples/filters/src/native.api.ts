// Made by wasm-facade (react-native) from the Rust declarations: not to edit

/** The functions */
export const FUNCTIONS = ['histogram', 'interleave', 'stats'] as const;

/** `Blur`'s methods */
export const BLUR_METHODS = ['apply', 'applyLater', 'applyWhere'] as const;

/** `Blur`'s properties */
export const BLUR_PROPERTIES = ['radius', 'edge'] as const;

/** `Blur`'s events */
export const BLUR_EVENTS = ['progress', 'change'] as const;

/** `Grade`'s methods */
export const GRADE_METHODS = ['setLevelsProperty', 'getLevelsProperty', 'apply'] as const;

/** `Grade`'s properties */
export const GRADE_PROPERTIES = [] as const;

/** `Grade`'s events */
export const GRADE_EVENTS = ['change'] as const;

/** `Preview`'s methods, written by hand */
export const PREVIEW_METHODS = ['show', 'fadeTo', 'pixels', 'snapshot', 'clear'] as const;

/** `Preview`'s events */
export const PREVIEW_EVENTS = ['shown', 'radiuschange', 'cleared'] as const;
