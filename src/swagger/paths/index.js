import { authPaths, authTags } from './auth.paths.js';
import { searchPaths, searchTags } from './search.paths.js';
import { downloadPaths, downloadTags } from './download.paths.js';
import { adminPaths, adminTags } from './admin.paths.js';

export const paths = {
  ...authPaths,
  ...searchPaths,
  ...downloadPaths,
  ...adminPaths,
};

export const tags = [{ name: authTags }, { name: searchTags }, { name: downloadTags }, { name: adminTags }];
