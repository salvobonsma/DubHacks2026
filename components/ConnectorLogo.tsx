/** Full-color marks for brands whose Simple Icons version is single-color. */
const INLINE: Record<string, { viewBox: string; paths: [string, string][] }> = {
  googledrive: {
    viewBox: "0 0 87.3 78",
    paths: [
      ["#0066da", "m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"],
      ["#00ac47", "m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"],
      ["#ea4335", "m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"],
      ["#00832d", "m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"],
      ["#2684fc", "m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"],
      ["#ffba00", "m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"],
    ],
  },
  gmail: {
    viewBox: "52 42 88 66",
    paths: [
      ["#4285f4", "M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"],
      ["#34a853", "M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"],
      ["#fbbc04", "M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"],
      ["#ea4335", "M72 74V48l24 18 24-18v26L96 92"],
      ["#c5221f", "M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"],
    ],
  },
};

/** Brand logo by Simple Icons slug, served from cdn.simpleicons.org unless we inline a full-color one. */
export function ConnectorLogo({ slug, className = "h-6 w-6" }: { slug: string; className?: string }) {
  const inline = INLINE[slug];
  if (inline)
    return (
      <svg viewBox={inline.viewBox} className={`${className} object-contain`} aria-hidden>
        {inline.paths.map(([fill, d]) => (
          <path key={d} fill={fill} d={d} />
        ))}
      </svg>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://cdn.simpleicons.org/${slug}`} alt="" className={className} loading="lazy" />;
}
