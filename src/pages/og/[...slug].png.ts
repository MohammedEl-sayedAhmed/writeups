import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function getStaticPaths() {
	const posts = await getCollection('blog');
	return posts.map((post) => ({
		params: { slug: post.id },
		props: { post },
	}));
}

const fontFile = (weight: 400 | 700) =>
	path.resolve(
		process.cwd(),
		`node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff`,
	);

export const GET: APIRoute = async ({ props }) => {
	const { post } = props as { post: Awaited<ReturnType<typeof getCollection>>[number] };
	const [interRegular, interBold] = await Promise.all([
		fs.readFile(fontFile(400)),
		fs.readFile(fontFile(700)),
	]);

	const title: string = post.data.title;
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

	const tree = {
		type: 'div',
		props: {
			style: {
				width: '1200px',
				height: '630px',
				background: '#ffffff',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'space-between',
				padding: '72px',
				fontFamily: 'Inter',
				color: '#18181b',
				position: 'relative',
			},
			children: [
				{
					type: 'div',
					props: {
						style: {
							display: 'flex',
							alignItems: 'center',
							gap: '16px',
							fontSize: '24px',
							fontWeight: 700,
							letterSpacing: '-0.015em',
						},
						children: [
							{
								type: 'div',
								props: {
									style: {
										width: '12px',
										height: '12px',
										background: '#c2410c',
										borderRadius: '2px',
									},
								},
							},
							'writeups',
						],
					},
				},
				{
					type: 'div',
					props: {
						style: {
							display: 'flex',
							flexDirection: 'column',
							gap: '32px',
						},
						children: [
							{
								type: 'div',
								props: {
									style: {
										fontSize: '64px',
										fontWeight: 700,
										letterSpacing: '-0.035em',
										lineHeight: 1.1,
										color: '#18181b',
									},
									children: title,
								},
							},
							{
								type: 'div',
								props: {
									style: {
										display: 'flex',
										alignItems: 'center',
										gap: '16px',
										fontSize: '24px',
										color: '#52525b',
									},
									children: [
										dateLabel,
										...(tags.length
											? [
													{
														type: 'span',
														props: {
															style: { color: '#a1a1aa' },
															children: '·',
														},
													},
													tags.join(' · '),
												]
											: []),
									],
								},
							},
						],
					},
				},
				{
					type: 'div',
					props: {
						style: {
							position: 'absolute',
							right: '72px',
							bottom: '72px',
							fontSize: '20px',
							color: '#a1a1aa',
						},
						children: 'mammar.pages.dev',
					},
				},
			],
		},
	};

	const svg = await satori(tree as never, {
		width: 1200,
		height: 630,
		fonts: [
			{ name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
			{ name: 'Inter', data: interBold, weight: 700, style: 'normal' },
		],
	});

	const png = new Resvg(svg, {
		fitTo: { mode: 'width', value: 1200 },
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
