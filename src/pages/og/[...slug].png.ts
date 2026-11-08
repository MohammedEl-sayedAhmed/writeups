import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { Resvg } from '@resvg/resvg-js';
import { OG_WIDTH, renderOgSvg } from '../../lib/og';

export async function getStaticPaths() {
	const posts = await getCollection('blog');
	return posts.map((post) => ({
		params: { slug: post.id },
		props: { post },
	}));
}

export const GET: APIRoute = async ({ props }) => {
	const { post } = props as { post: Awaited<ReturnType<typeof getCollection>>[number] };

	const tags: string[] = post.data.tags
		? post.data.tags
				.split(',')
				.map((t: string) => t.trim())
				.filter(Boolean)
		: [];
	const dateLabel = new Date(post.data.pubDate).toLocaleDateString('en-us', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});

	const svg = await renderOgSvg({ title: post.data.title, tags, dateLabel });

	const png = new Resvg(svg, {
		fitTo: { mode: 'width', value: OG_WIDTH },
	})
		.render()
		.asPng();

	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
