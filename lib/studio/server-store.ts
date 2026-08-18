import { FileStudioJobStore } from './jobs';
import { FileStudioStore } from './store';

/** Shares the `data/` volume with the Curiosity stores; one directory per concern. */
export const studioStore = new FileStudioStore();
export const studioJobStore = new FileStudioJobStore();
