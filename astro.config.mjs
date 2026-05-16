// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';

// https://astro.build/config
export default defineConfig({
	// Used for canonical URLs and the generated sitemap. Update if a custom domain is added later.
	site: 'https://mammar.pages.dev',
	integrations: [mdx(), sitemap()],
	markdown: {
		rehypePlugins: [
			rehypeSlug,
			[
				rehypeAutolinkHeadings,
				{
					behavior: 'append',
					properties: { className: ['heading-anchor'], ariaLabel: 'Link to this section' },
					content: { type: 'text', value: '#' },
				},
			],
		],
	},
});
