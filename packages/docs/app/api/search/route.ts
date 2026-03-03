import { docs } from '@/source';
import { createSearchAPI } from 'fumadocs-core/search/server';

export const { GET } = createSearchAPI('advanced', {
  indexes: docs.getPages().map((page) => ({
    title: page.data.title,
    description: page.data.description,
    url: `/docs/${page.slugs.join('/')}`,
    content: page.data.body.raw,
  })),
});
