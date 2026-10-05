import type { SpaceFactory } from '../../core/types';
import { createModelViewer } from '../../shared/model-viewer';
import { SHEEN_CHAIR } from './data';

/** A model Space is its data plus the shared viewer (spec 010, D-012). */
const createSheenChair: SpaceFactory = (ctx) => createModelViewer(ctx, SHEEN_CHAIR);

export default createSheenChair;
