import satori from 'satori';
import fs from 'node:fs/promises';
import path from 'node:path';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_PADDING = 72;
export const OG_SITE_LABEL = 'mammar.pages.dev';

export interface OgInput {
	title: string;
	tags: string[];
	dateLabel: string;
}

type OgNode = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };

const el = (
	type: string,
	style: Record<string, unknown>,
	children?: unknown,
): OgNode => ({ type, props: { style, children } });

/**
 * Element tree for the OG card. satori 0.63 defaults to content-box sizing,
 * so the root sets border-box: otherwise its 72px padding is added on top of
 * 1200x630 and the content spills off the canvas. Inner boxes keep explicit
 * widths so the title wraps and the tags row can truncate.
 */
export function buildOgTree({ title, tags, dateLabel }: OgInput): OgNode {
	const inner = OG_WIDTH - OG_PADDING * 2;
	const tagText = tags.join(' · ');

	return el(
		'div',
		{
			width: `${OG_WIDTH}px`,
			height: `${OG_HEIGHT}px`,
			boxSizing: 'border-box',
			background: '#ffffff',
			display: 'flex',
			flexDirection: 'column',
			justifyContent: 'space-between',
			padding: `${OG_PADDING}px`,
			fontFamily: 'Inter',
			color: '#18181b',
		},
		[
			el(
				'div',
				{
					display: 'flex',
					alignItems: 'center',
					width: `${inner}px`,
					fontSize: '24px',
					fontWeight: 700,
					letterSpacing: '-0.015em',
				},
				[
					el('div', {
						width: '12px',
						height: '12px',
						marginRight: '16px',
						background: '#c2410c',
						borderRadius: '2px',
					}),
					el('div', { display: 'flex' }, 'writeups'),
				],
			),
			el(
				'div',
				{ display: 'flex', flexDirection: 'column', width: `${inner}px` },
				[
					el(
						'div',
						{
							// lineClamp only applies to display: block boxes in satori.
							display: 'block',
							width: `${inner}px`,
							marginBottom: '32px',
							fontSize: '64px',
							fontWeight: 700,
							letterSpacing: '-0.035em',
							lineHeight: 1.1,
							lineClamp: 3,
							color: '#18181b',
						},
						title,
					),
					el(
						'div',
						{
							display: 'flex',
							alignItems: 'center',
							width: `${inner}px`,
							fontSize: '24px',
							color: '#52525b',
						},
						[
							el('div', { display: 'flex', flexShrink: 0 }, dateLabel),
							...(tagText
								? [
										el(
											'div',
											{ display: 'flex', flexShrink: 0, margin: '0 16px', color: '#a1a1aa' },
											'·',
										),
										el(
											'div',
											{
												display: 'flex',
												flex: 1,
												minWidth: 0,
												overflow: 'hidden',
												whiteSpace: 'nowrap',
												textOverflow: 'ellipsis',
											},
											tagText,
										),
									]
								: [el('div', { display: 'flex', flex: 1 })]),
							el(
								'div',
								{
									display: 'flex',
									flexShrink: 0,
									marginLeft: '32px',
									fontSize: '20px',
									color: '#a1a1aa',
								},
								OG_SITE_LABEL,
							),
						],
					),
				],
			),
		],
	);
}

const fontFile = (weight: 400 | 700) =>
	path.resolve(
		process.cwd(),
		`node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff`,
	);

export async function renderOgSvg(input: OgInput): Promise<string> {
	const [interRegular, interBold] = await Promise.all([
		fs.readFile(fontFile(400)),
		fs.readFile(fontFile(700)),
	]);
	// satori types its input as a React node; this plain object tree has the same shape.
	return satori(buildOgTree(input) as never, {
		width: OG_WIDTH,
		height: OG_HEIGHT,
		fonts: [
			{ name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
			{ name: 'Inter', data: interBold, weight: 700, style: 'normal' },
		],
	});
}
