// French dictionary: English text -> French text, split by area of the CMS.
import shared from './shared';
import server from './server';
import web from './web';

export const FR: Record<string, string> = {
  ...shared,
  ...server,
  ...web,
};
