import { FileStudioStore } from './store';

/** Shares the `data/` volume with the Curiosity stores; one directory per concern. */
export const studioStore = new FileStudioStore();
