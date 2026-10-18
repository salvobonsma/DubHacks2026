/** Full-color marks for brands whose Simple Icons version is single-color. */
const INLINE: Record<string, { viewBox: string; paths: [string, string][] }> = {
  google: {
    viewBox: "0 0 48 48",
    paths: [
      ["#EA4335", "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"],
      ["#4285F4", "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"],
      ["#FBBC05", "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"],
      ["#34A853", "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"],
    ],
  },
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

/** Official marks for brands Simple Icons doesn't carry, served from public/. */
const LOCAL: Record<string, string> = { tmobile: "/tmobile/t-mark.svg" };

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
  return <img src={LOCAL[slug] ?? `https://cdn.simpleicons.org/${slug}`} alt="" className={className} loading="lazy" />;
}
