export function BrandMark({ size = 48, className = "", title, monochrome = false }) {
  const ink = monochrome ? "currentColor" : "#173e2f";

  return (
    <svg
      className={`restrova-brand-mark ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect x="3" y="3" width="58" height="58" rx="18" fill={monochrome ? "none" : ink} />
      <circle
        cx="32"
        cy="32"
        r="22"
        fill={monochrome ? "none" : "#8edb70"}
        stroke={monochrome ? ink : "#c7e7b6"}
        strokeWidth="2"
      />
      <path
        d="M20 17h13.5C41.5 17 46 21.1 46 28c0 4.7-2.3 8.1-6.3 9.8L48 48H37.5L30 38h-1v10h-9V17Zm9 8v5h4c2.6 0 4-.7 4-2.5S35.6 25 33 25h-4Z"
        fill={monochrome ? ink : "#173e2f"}
        fillRule="evenodd"
      />
      <rect x="48" y="6" width="9" height="9" rx="1" fill={monochrome ? ink : "#e49b7c"} />
    </svg>
  );
}

export function BrandPixels({ className = "" }) {
  return (
    <span className={`brand-pixels ${className}`.trim()} aria-hidden="true">
      <span className="brand-pixel" />
      <span className="brand-pixel" />
      <span className="brand-pixel" />
    </span>
  );
}
