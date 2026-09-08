export * from './contract.js';
import type { DrawingEngine, DrawingLiveView, DrawingPlayer } from './contract.js';
// @ts-ignore -- the implementation is plain JavaScript in the library
import * as impl from '../../public/lib/contract/index.js';

export const createDrawingEngine = (): DrawingEngine => impl.createDrawingEngine();
export const createDrawingLiveView = (): DrawingLiveView => impl.createDrawingLiveView();
export const createDrawingPlayer = (): DrawingPlayer => impl.createDrawingPlayer();
