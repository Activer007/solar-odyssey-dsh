import type { EffectComposer } from 'postprocessing';
/** A reference to the mounted composer, used only by read-only development diagnostics. */
export const renderPipeline: { composer: EffectComposer | null } = { composer: null };
