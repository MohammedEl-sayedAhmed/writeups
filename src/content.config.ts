import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			// Astro-native fields
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),

			// Cross-post fields consumed by .github/workflows/crosspost.yml (via sinedied/publish-devto).
			// All optional — omit them and a post is Astro-only.
			tags: z.string().optional(),
			published: z.boolean().optional().default(true),
			canonical_url: z.string().url().optional(),
			// Per-post toggle for the comments section. Defaults on; set
			// `comments: false` in frontmatter to hide the Giscus widget on a
			// specific post (e.g. for short announcements).
			comments: z.boolean().optional().default(true),

			// Written back by the cross-post action after the first successful publish; do not edit by hand.
			id: z.number().optional(),
		}),
});

export const collections = { blog };
